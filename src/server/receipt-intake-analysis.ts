import { getReceiptsBucket } from "@/db";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import type { ReceiptField } from "./receipt-extraction";
import type { IntakePatch } from "./receipt-intake-validation";
import { receiptSha256 } from "./receipt-intake-storage";
import { recoverStaleTokenlessAnalysis } from "./receipt-intake-auto-confirm-lease";

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
): Promise<void> {
  await recoverStaleTokenlessAnalysis(principal, id);
  const locked = await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'analysing',
           error_code = NULL, error_message = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ?
         AND status IN ('uploaded', 'needs_review', 'ready', 'failed')
       RETURNING id`,
    )
    .bind(principal.ownerId, id)
    .first<{ id: string }>();
  if (!locked) {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "This receipt is already being analysed.",
    );
  }
  try {
    const sha256 = await receiptSha256(bytes);
    await getReceiptsBucket().put(objectKey, bytes, {
      httpMetadata: { contentType },
      customMetadata: { sha256 },
    });
  } catch {
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             error_code = 'analysis_storage_failed',
             error_message = 'The analysis copy could not be stored. The original remains safe.'
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(principal.ownerId, id)
      .run();
    throw new ApiError(
      503,
      "analysis_storage_failed",
      "The analysis copy could not be stored. The original remains safe.",
    );
  }
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
