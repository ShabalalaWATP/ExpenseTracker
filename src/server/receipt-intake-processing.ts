import { consumeAiQuota } from "./ai-quota";
import { getReceiptsBucket } from "@/db";
import { database } from "./db";
import { ApiError } from "./http";
import { extractReceipt } from "./openai-client";
import type { Principal } from "./principal";
import type { ReceiptField } from "./receipt-extraction";
import { persistReceiptExtraction } from "./receipt-analysis-persistence";
import {
  beginReceiptAnalysis,
  isAllowedClarificationPatch,
  safeAnalysisError,
} from "./receipt-intake-analysis";
import { publicIntake, unresolvedFields } from "./receipt-intake-model";
import {
  requireIntake,
} from "./receipt-intake-repository";
import { updateReceiptIntake } from "./receipt-intake-review-repository";
import { runtimeConfig } from "./runtime-config";
import { validateImageType } from "./receipt-repository";

const MAX_ANALYSIS_BYTES = 10 * 1024 * 1024;

export async function analyseReceiptIntake(
  principal: Principal,
  id: string,
  bytes: Uint8Array,
  declaredType: string | null,
  options: {
    targetedFields?: readonly ReceiptField[];
    imageEdits?: Record<string, number>;
  } = {},
) {
  let existing = await requireIntake(principal, id);
  if (existing.status === "confirmed") {
    throw new ApiError(409, "receipt_confirmed", "This receipt is already confirmed.");
  }
  if (bytes.length === 0 || bytes.length > MAX_ANALYSIS_BYTES) {
    throw new ApiError(
      413,
      "analysis_image_too_large",
      "The analysis image must be 10 MB or smaller.",
    );
  }
  const contentType = validateImageType(bytes, declaredType);
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new ApiError(
      415,
      "analysis_image_invalid",
      "Use the Safari-compatible JPEG analysis image.",
    );
  }
  const analysisObjectKey = `receipt-intakes/${principal.ownerId}/${id}/analysis-${crypto.randomUUID()}.${
    contentType === "image/png" ? "png" : "jpg"
  }`;
  await beginReceiptAnalysis(
    principal,
    id,
    analysisObjectKey,
    bytes,
    contentType,
  );
  existing = await requireIntake(principal, id);

  if (!runtimeConfig().openAiApiKey) {
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             analysis_object_key = ?,
             error_code = 'openai_not_configured',
             error_message = 'AI setup is needed. You can still enter the details manually.'
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(analysisObjectKey, principal.ownerId, id)
      .run();
    if (
      existing.analysis_object_key &&
      existing.analysis_object_key !== analysisObjectKey
    ) {
      await getReceiptsBucket()
        .delete(existing.analysis_object_key)
        .catch(() => {});
    }
    return publicIntake(await requireIntake(principal, id));
  }

  try {
    await consumeAiQuota(principal, "receiptAnalysis", id);
    const { extraction, model } = await extractReceipt(
      bytes,
      contentType,
      principal,
      options.targetedFields,
    );
    await persistReceiptExtraction(principal, existing, extraction, model, {
      targetedFields: options.targetedFields,
      imageEdits: options.imageEdits,
      analysisObjectKey,
    });
    if (
      existing.analysis_object_key &&
      existing.analysis_object_key !== analysisObjectKey
    ) {
      await getReceiptsBucket()
        .delete(existing.analysis_object_key)
        .catch(() => {});
    }
  } catch (error) {
    const current = await requireIntake(principal, id).catch(() => null);
    if (current && current.analysis_object_key !== analysisObjectKey) {
      await getReceiptsBucket().delete(analysisObjectKey).catch(() => {});
    }
    const safe = safeAnalysisError(error);
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review', error_code = ?, error_message = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE owner_id = ? AND id = ? AND status = 'analysing'`,
      )
      .bind(safe.code, safe.message, principal.ownerId, id)
      .run()
      .catch(() => {});
  }
  return publicIntake(await requireIntake(principal, id));
}

export async function saveClarification(
  principal: Principal,
  id: string,
  patch: Parameters<typeof updateReceiptIntake>[2],
) {
  const row = await requireIntake(principal, id);
  const field = unresolvedFields(row)[0];
  if (!isAllowedClarificationPatch(field, patch)) {
    throw new ApiError(
      400,
      "clarification_field_forbidden",
      "Voice can update only the receipt detail currently being clarified.",
    );
  }
  return updateReceiptIntake(principal, id, patch, "voice");
}
