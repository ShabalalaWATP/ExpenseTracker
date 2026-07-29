import { consumeAiQuota } from "./ai-quota";
import { assertDateUnlocked } from "./claim-locks";
import { auditStatement } from "./audit-repository";
import { database } from "./db";
import { ApiError } from "./http";
import { extractReceipt } from "./openai-client";
import type { Principal } from "./principal";
import {
  beginReceiptAnalysis,
  isAllowedClarificationPatch,
  requiredMissing,
  safeAnalysisError,
} from "./receipt-intake-analysis";
import { publicIntake, unresolvedFields } from "./receipt-intake-model";
import {
  requireIntake,
  updateReceiptIntake,
} from "./receipt-intake-repository";
import { runtimeConfig } from "./runtime-config";
import { validateImageType } from "./receipt-repository";

const MAX_ANALYSIS_BYTES = 10 * 1024 * 1024;

export async function analyseReceiptIntake(
  principal: Principal,
  id: string,
  bytes: Uint8Array,
  declaredType: string | null,
) {
  const existing = await requireIntake(principal, id);
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
  const analysisObjectKey = `receipt-intakes/${id}/analysis.${
    contentType === "image/png" ? "png" : "jpg"
  }`;
  await beginReceiptAnalysis(
    principal,
    id,
    existing.analysis_object_key,
    analysisObjectKey,
    bytes,
    contentType,
  );

  if (!runtimeConfig().openAiApiKey) {
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             error_code = 'openai_not_configured',
             error_message = 'AI setup is needed. You can still enter the details manually.'
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(principal.ownerId, id)
      .run();
    return publicIntake(await requireIntake(principal, id));
  }

  try {
    await consumeAiQuota(principal, "receiptAnalysis", id);
    const { extraction, model } = await extractReceipt(
      bytes,
      contentType,
      principal,
    );
    const merchant = extraction.merchant ?? existing.merchant;
    const serviceDate = existing.service_date ?? extraction.serviceDate;
    const receiptTotalPence =
      extraction.receiptTotalPence ?? existing.receipt_total_pence;
    let eligiblePence =
      extraction.eligiblePence ?? existing.eligible_pence;
    const location = existing.location ?? extraction.locationHint;
    const businessReason = existing.business_reason;
    const missing = new Set([
      ...extraction.missingFields,
      ...requiredMissing({
        merchant,
        serviceDate,
        receiptTotalPence,
        eligiblePence,
        location,
        businessReason,
      }),
    ]);
    const uncertain = new Set(extraction.uncertainFields);
    if (extraction.confidence.merchant < 0.78) uncertain.add("merchant");
    if (extraction.confidence.serviceDate < 0.78) {
      uncertain.add("service_date");
    }
    if (extraction.confidence.receiptTotal < 0.82) {
      uncertain.add("receipt_total");
    }
    if (extraction.confidence.eligibleAmount < 0.82) {
      uncertain.add("eligible_amount");
    }
    if (extraction.currency !== "GBP") uncertain.add("receipt_total");
    if (
      receiptTotalPence !== null &&
      eligiblePence !== null &&
      eligiblePence > receiptTotalPence
    ) {
      eligiblePence = null;
      uncertain.add("eligible_amount");
    }
    if (merchant) missing.delete("merchant");
    if (serviceDate) missing.delete("service_date");
    if (receiptTotalPence !== null) missing.delete("receipt_total");
    if (eligiblePence !== null) missing.delete("eligible_amount");
    if (location) missing.delete("location");
    if (businessReason) missing.delete("business_reason");
    const alcoholSuspected =
      extraction.alcoholSuspected ||
      extraction.lineItems.some((item) => item.alcoholSuspected);
    const unresolvedCount =
      missing.size + uncertain.size + Number(alcoholSuspected);
    await database().batch([
      database()
        .prepare(
          `UPDATE receipt_intakes
           SET status = ?, merchant = ?, service_date = ?,
               receipt_total_pence = ?, eligible_pence = ?,
               gratuity_pence = ?, location = ?,
               line_items_json = ?, confidence_json = ?,
               missing_fields_json = ?, uncertain_fields_json = ?,
               alcohol_suspected = ?, alcohol_reviewed = 0,
               extraction_json = ?, ai_model = ?,
               error_code = NULL, error_message = NULL,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE owner_id = ? AND id = ?`,
        )
        .bind(
          unresolvedCount ? "needs_review" : "ready",
          merchant,
          serviceDate,
          receiptTotalPence,
          eligiblePence,
          extraction.gratuityPence,
          location,
          JSON.stringify(extraction.lineItems),
          JSON.stringify(extraction.confidence),
          JSON.stringify([...missing]),
          JSON.stringify([...uncertain]),
          Number(alcoholSuspected),
          JSON.stringify(extraction),
          model,
          principal.ownerId,
          id,
        ),
      auditStatement(principal, {
        action: "receipt_intake.analysed",
        entityType: "receipt_intake",
        entityId: id,
        metadata: {
          model,
          requiresReview: Boolean(unresolvedCount),
          lineItemCount: extraction.lineItems.length,
        },
      }),
    ]);
  } catch (error) {
    const safe = safeAnalysisError(error);
    await database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review', error_code = ?, error_message = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(safe.code, safe.message, principal.ownerId, id)
      .run();
  }
  return publicIntake(await requireIntake(principal, id));
}

export async function confirmReceiptIntake(
  principal: Principal,
  id: string,
) {
  const row = await requireIntake(principal, id);
  if (row.status === "confirmed") {
    throw new ApiError(409, "receipt_confirmed", "This receipt is already confirmed.");
  }
  if (row.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before confirming it.",
    );
  }
  const unresolved = unresolvedFields(row);
  if (unresolved.length) {
    throw new ApiError(
      409,
      "receipt_needs_review",
      "Resolve the highlighted receipt details before confirming.",
      { fields: unresolved },
    );
  }
  if (
    !row.merchant ||
    !row.service_date ||
    !row.location ||
    !row.business_reason ||
    row.receipt_total_pence === null ||
    row.eligible_pence === null
  ) {
    throw new ApiError(
      409,
      "receipt_needs_review",
      "Complete all required receipt details before confirming.",
    );
  }
  if (
    row.eligible_pence > row.receipt_total_pence ||
    row.gratuity_pence > row.eligible_pence
  ) {
    throw new ApiError(
      400,
      "validation_failed",
      "Eligible amount and gratuity must fit within the receipt total.",
    );
  }
  await assertDateUnlocked(principal.ownerId, row.service_date);
  if (row.trip_id) {
    const trip = await database()
      .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
      .bind(principal.ownerId, row.trip_id)
      .first<{ id: string }>();
    if (!trip) {
      throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
    }
  }
  const expenseId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();
  const db = database();
  await db.batch([
    db
      .prepare(
        `INSERT INTO expenses (
          id, owner_id, service_date, merchant, location, business_reason,
          receipt_total_pence, eligible_pence, gratuity_pence,
          currency, country, trip_id, meal_context, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'GB', ?, ?, ?)`,
      )
      .bind(
        expenseId,
        principal.ownerId,
        row.service_date,
        row.merchant,
        row.location,
        row.business_reason,
        row.receipt_total_pence,
        row.eligible_pence,
        row.gratuity_pence,
        row.trip_id,
        row.meal_context,
        row.ai_model
          ? `Receipt details suggested by ${row.ai_model} and confirmed by the owner.`
          : "Receipt details entered and confirmed by the owner.",
      ),
    db
      .prepare(
        `INSERT INTO receipts (
          id, owner_id, expense_id, object_key, content_type,
          byte_size, sha256, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        receiptId,
        principal.ownerId,
        expenseId,
        row.original_object_key,
        row.content_type,
        row.byte_size,
        row.sha256,
        row.idempotency_key,
      ),
    db
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'confirmed', expense_id = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(expenseId, principal.ownerId, id),
    auditStatement(principal, {
      action: "receipt_intake.confirmed",
      entityType: "expense",
      entityId: expenseId,
      metadata: {
        sourceIntakeId: id,
        aiAssisted: Boolean(row.ai_model),
      },
    }),
  ]);
  return {
    intake: publicIntake(await requireIntake(principal, id)),
    expense: {
      id: expenseId,
      serviceDate: row.service_date,
      merchant: row.merchant,
      receiptTotalPence: row.receipt_total_pence,
      eligiblePence: row.eligible_pence,
      location: row.location,
      businessReason: row.business_reason,
      tripId: row.trip_id,
      mealContext: row.meal_context,
      receipt: {
        id: receiptId,
        url: `/api/receipts/${receiptId}`,
      },
    },
  };
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
  return updateReceiptIntake(principal, id, patch);
}
