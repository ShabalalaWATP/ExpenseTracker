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
import { validateImageType } from "./receipt-image-validation";
import { recoverExpiredReceiptAnalysis } from "./receipt-analysis-lease";
import { recoverStaleTokenlessAnalysis } from "./receipt-intake-auto-confirm-lease";

const MAX_ANALYSIS_BYTES = 10 * 1024 * 1024;

async function removeSupersededAnalysisCopy(
  principal: Principal,
  id: string,
  previousObjectKey: string | null,
  currentObjectKey: string,
): Promise<void> {
  if (!previousObjectKey || previousObjectKey === currentObjectKey) return;
  try {
    await getReceiptsBucket().delete(previousObjectKey);
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET analysis_previous_object_key = NULL
         WHERE owner_id = ? AND id = ?
           AND analysis_previous_object_key = ?`,
      )
      .bind(principal.ownerId, id, previousObjectKey)
      .run();
  } catch {
    // Keep the previous key on the row so later removal can retry cleanup.
  }
}

async function clearTrackedPreviousAnalysisCopy(
  principal: Principal,
  row: Awaited<ReturnType<typeof requireIntake>>,
): Promise<void> {
  const key = row.analysis_previous_object_key;
  if (!key) return;
  try {
    await getReceiptsBucket().delete(key);
  } catch {
    throw new ApiError(
      503,
      "analysis_cleanup_pending",
      "An older analysis copy is still being secured. Try again shortly.",
    );
  }
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET analysis_previous_object_key = NULL
       WHERE owner_id = ? AND id = ? AND status <> 'analysing'
         AND analysis_previous_object_key = ?`,
    )
    .bind(principal.ownerId, row.id, key)
    .run();
}

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
  if (existing.status === "analysing") {
    if (existing.analysis_token) {
      await recoverExpiredReceiptAnalysis(
        principal,
        id,
        existing.analysis_token,
      );
    } else if (!existing.auto_confirm_token) {
      await recoverStaleTokenlessAnalysis(principal, id);
    }
    existing = await requireIntake(principal, id);
  }
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
  await clearTrackedPreviousAnalysisCopy(principal, existing);
  existing = await requireIntake(principal, id);
  const analysisObjectKey = `receipt-intakes/${principal.ownerId}/${id}/analysis-${crypto.randomUUID()}.${
    contentType === "image/png" ? "png" : "jpg"
  }`;
  const previousAnalysisObjectKey = existing.analysis_object_key;
  const analysisToken = await beginReceiptAnalysis(
    principal,
    id,
    analysisObjectKey,
    bytes,
    contentType,
  );
  existing = await requireIntake(principal, id);

  if (!runtimeConfig().openAiApiKey) {
    const saved = await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             analysis_object_key = ?,
             error_code = 'openai_not_configured',
             error_message = 'AI setup is needed. You can still enter the details manually.',
             analysis_token = NULL, analysis_lease_expires_at = NULL
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND analysis_token = ?`,
      )
      .bind(analysisObjectKey, principal.ownerId, id, analysisToken)
      .run();
    if (Number(saved.meta.changes ?? 0) !== 1) {
      await getReceiptsBucket().delete(analysisObjectKey).catch(() => {});
      throw new ApiError(
        409,
        "receipt_analysis_superseded",
        "This analysis was cancelled or replaced before it could be saved.",
      );
    }
    await removeSupersededAnalysisCopy(
      principal,
      id,
      previousAnalysisObjectKey,
      analysisObjectKey,
    );
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
      analysisToken,
    });
  } catch (error) {
    const current = await requireIntake(principal, id).catch(() => null);
    if (!current || current.analysis_object_key !== analysisObjectKey) {
      await getReceiptsBucket().delete(analysisObjectKey).catch(() => {});
    }
    const safe = safeAnalysisError(error);
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review', error_code = ?, error_message = ?,
             analysis_token = NULL, analysis_lease_expires_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE owner_id = ? AND id = ? AND status = 'analysing'
            AND analysis_token = ?`,
      )
      .bind(safe.code, safe.message, principal.ownerId, id, analysisToken)
      .run()
      .catch(() => {});
  }
  await removeSupersededAnalysisCopy(
    principal,
    id,
    previousAnalysisObjectKey,
    analysisObjectKey,
  );
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
