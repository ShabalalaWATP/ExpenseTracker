import { getReceiptsBucket } from "@/db";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import type { ReceiptField } from "./receipt-extraction";
import type { IntakePatch } from "./receipt-intake-validation";
import { receiptSha256 } from "./receipt-intake-storage";
import { recoverStaleTokenlessAnalysis } from "./receipt-intake-auto-confirm-lease";
import { STALE_RECEIPT_ANALYSIS_MINUTES } from "../shared/receipt-processing-policy";

export function safeAnalysisError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "analysis_failed",
    message:
      "AI could not analyse this receipt. Review it manually or retry.",
  };
}

export async function beginReceiptAnalysis(
  principal: Principal,
  id: string,
  objectKey: string,
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
): Promise<string> {
  await recoverStaleTokenlessAnalysis(principal, id);
  const analysisToken = crypto.randomUUID();
  const sha256 = await receiptSha256(bytes);
  let locked: { id: string } | null;
  try {
    locked = await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'analysing',
             analysis_previous_object_key = analysis_object_key,
             analysis_object_key = ?,
             analysis_token = ?,
             analysis_lease_expires_at =
               strftime(
                 '%Y-%m-%dT%H:%M:%fZ',
                 'now',
                 '+${STALE_RECEIPT_ANALYSIS_MINUTES} minutes'
               ),
             error_code = NULL, error_message = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ?
           AND status IN ('uploaded', 'needs_review', 'ready', 'failed')
         RETURNING id`,
      )
      .bind(objectKey, analysisToken, principal.ownerId, id)
      .first<{ id: string }>();
  } catch (error) {
    await getReceiptsBucket().delete(objectKey).catch(() => {});
    throw error;
  }
  if (!locked) {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "This receipt is already being analysed.",
    );
  }
  try {
    await getReceiptsBucket().put(objectKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { sha256 },
    });
  } catch {
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             analysis_object_key = analysis_previous_object_key,
             analysis_previous_object_key = NULL,
             analysis_token = NULL, analysis_lease_expires_at = NULL,
             error_code = 'analysis_storage_failed',
             error_message = 'The analysis copy could not be stored. The original remains safe.',
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND analysis_token = ?`,
      )
      .bind(principal.ownerId, id, analysisToken)
      .run()
      .catch(() => {});
    throw new ApiError(
      503,
      "analysis_storage_failed",
      "The analysis copy could not be stored. The original remains safe.",
    );
  }
  const current = await database()
    .prepare(
      `SELECT id FROM receipt_intakes
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND analysis_token = ? AND discarded_at IS NULL`,
    )
    .bind(principal.ownerId, id, analysisToken)
    .first<{ id: string }>()
    .catch(() => null);
  if (!current) {
    await getReceiptsBucket().delete(objectKey).catch(() => {});
    throw new ApiError(
      409,
      "receipt_analysis_superseded",
      "This analysis was cancelled before its image could be secured.",
    );
  }
  return analysisToken;
}

export function requiredMissing(values: {
  merchant: string | null;
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  location: string | null;
  businessReason: string | null;
}): string[] {
  return [
    ...(!values.merchant ? ["merchant"] : []),
    ...(!values.serviceDate ? ["service_date"] : []),
    ...(values.receiptTotalPence === null ? ["receipt_total"] : []),
    ...(values.eligiblePence === null ? ["eligible_amount"] : []),
    ...(!values.location ? ["location"] : []),
    ...(!values.businessReason ? ["business_reason"] : []),
  ];
}

export function isAllowedClarificationPatch(
  field: ReceiptField | undefined,
  patch: IntakePatch,
): boolean {
  const keyForField: Partial<Record<ReceiptField, keyof IntakePatch>> = {
    merchant: "merchant",
    service_date: "serviceDate",
    receipt_total: "receiptTotalPence",
    eligible_amount: "eligiblePence",
    location: "location",
    business_reason: "businessReason",
    alcohol: "alcoholReviewed",
    category: "category",
  };
  const allowedKey = field ? keyForField[field] : null;
  const suppliedKeys = Object.keys(patch);
  return (
    Boolean(allowedKey) &&
    suppliedKeys.length === 1 &&
    suppliedKeys[0] === allowedKey
  );
}
