import { decideTripReview } from "@/src/domain/receipt-trip-review";
import { auditStatementAfterChange } from "./audit-repository";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { applyCorrectedCurrency } from "./receipt-currency-correction";
import { duplicateCandidateState } from "./receipt-duplicates";
import {
  publicIntake,
  receiptGroupReview,
  unresolvedFields,
} from "./receipt-intake-model";
import { requireIntake } from "./receipt-intake-repository";
import {
  prepareReviewState,
  reconciliationNeedsReview,
  reviewJson,
  reviewRowValues,
} from "./receipt-intake-review-state";
import { receiptRevisionStatementAfterChange } from "./receipt-intake-revisions";
import type { IntakePatch } from "./receipt-intake-validation";
import {
  applyResolvedTripAssignment,
  applyResolvedTripLegAssignment,
  resolveReceiptTripLink,
  tripRevisionFields,
} from "./receipt-trip-link";

async function requireOwnedTrip(
  principal: Principal,
  tripId: string | null,
): Promise<void> {
  if (!tripId) return;
  const trip = await database()
    .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, tripId)
    .first<{ id: string }>();
  if (!trip) {
    throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
  }
}

async function releaseReviewLock(
  principal: Principal,
  id: string,
  priorStatus: string,
) {
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL`,
    )
    .bind(priorStatus, principal.ownerId, id)
    .run()
    .catch(() => {});
}

export async function updateReceiptIntake(
  principal: Principal,
  id: string,
  patch: IntakePatch,
  source: "manual" | "voice" = "manual",
) {
  const existing = await requireIntake(principal, id);
  let tripDecision = decideTripReview(existing.trip_id, patch);
  const explicitLegSelection =
    typeof patch.tripLegId === "string" &&
    patch.tripLegId.length > 0 &&
    patch.tripLegId !== existing.trip_leg_id;
  if (explicitLegSelection) {
    tripDecision = {
      tripId: patch.tripId ?? existing.trip_id,
      explicitlySelected: true,
    };
  }
  if (tripDecision.explicitlySelected) {
    patch = { ...patch, tripId: tripDecision.tripId };
  } else if ("tripId" in patch) {
    const withoutRoutineTrip = { ...patch };
    delete withoutRoutineTrip.tripId;
    patch = withoutRoutineTrip;
  }
  const resultingCategory =
    "category" in patch ? patch.category : existing.category;
  if (resultingCategory !== "food" && patch.mealContext !== null) {
    patch = { ...patch, mealContext: null };
  }
  if (existing.status === "confirmed") {
    return publicIntake(existing);
  }
  if (existing.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before editing it.",
    );
  }
  if (
    patch.originalCurrency &&
    existing.original_currency !== "UNKNOWN" &&
    patch.originalCurrency !== existing.original_currency
  ) {
    throw new ApiError(
      409,
      "receipt_original_locked",
      "Use Recheck to change a currency that the receipt reader already identified.",
    );
  }
  if (
    patch.originalCountry &&
    existing.original_country !== "UNKNOWN" &&
    patch.originalCountry !== existing.original_country
  ) {
    throw new ApiError(
      409,
      "receipt_original_locked",
      "Use Recheck to change a country that the receipt reader already identified.",
    );
  }
  const desiredCurrency =
    patch.originalCurrency ?? existing.original_currency;
  const foreignReceipt =
    desiredCurrency !== "GBP" && desiredCurrency !== "UNKNOWN";
  const dateChanged =
    patch.serviceDate !== undefined &&
    patch.serviceDate !== existing.service_date;
  const gbpValuesChanged =
    (patch.receiptTotalPence !== undefined &&
      patch.receiptTotalPence !== existing.receipt_total_pence) ||
    (patch.eligiblePence !== undefined &&
      patch.eligiblePence !== existing.eligible_pence) ||
    (patch.gratuityPence !== undefined &&
      patch.gratuityPence !== existing.gratuity_pence);
  const currentConversion = reviewJson<{ status?: string }>(
    existing.conversion_json,
    {},
  );
  if (foreignReceipt && dateChanged) {
    throw new ApiError(
      409,
      "foreign_receipt_reanalysis_required",
      "Use Recheck to correct a foreign receipt date so the official dated conversion is recalculated.",
    );
  }
  if (
    foreignReceipt &&
    gbpValuesChanged &&
    !(
      currentConversion.status === "unavailable" &&
      patch.conversionReviewed === true
    )
  ) {
    throw new ApiError(
      409,
      "foreign_receipt_reanalysis_required",
      "Use Recheck for foreign receipt amounts. Manual GBP values are available only when no official rate exists.",
    );
  }
  if (
    patch.groupReceiptDecision === "shared" &&
    existing.original_currency === "GBP"
  ) {
    const lines = reviewJson<Array<{
      totalPence?: unknown;
      eligible?: unknown;
      alcoholSuspected?: unknown;
    }>>(
      existing.line_items_json,
      [],
    );
    const selected = patch.groupReceiptSelectedItems ?? [];
    const selectedTotal = selected.reduce((sum, index) => {
      const amount = lines[index]?.totalPence;
      return Number.isSafeInteger(amount) &&
        lines[index]?.eligible !== false &&
        lines[index]?.alcoholSuspected !== true
        ? sum + Number(amount)
        : sum;
    }, 0);
    if (
      selected.length === 0 ||
      selected.some((index) => !lines[index]) ||
      selectedTotal < 1 ||
      selectedTotal !== patch.eligiblePence
    ) {
      throw new ApiError(
        400,
        "group_receipt_selection_invalid",
        "Select the items you had before confirming this shared receipt.",
      );
    }
  }
  await requireOwnedTrip(principal, patch.tripId ?? existing.trip_id);
  const receiptTotal =
    patch.receiptTotalPence ?? existing.receipt_total_pence;
  const eligible = patch.eligiblePence ?? existing.eligible_pence;
  const gratuity = patch.gratuityPence ?? existing.gratuity_pence;
  if (
    receiptTotal !== null &&
    eligible !== null &&
    (eligible > receiptTotal || gratuity > eligible)
  ) {
    throw new ApiError(
      400,
      "validation_failed",
      "Eligible amount and gratuity must fit within the receipt total.",
    );
  }
  const locked = await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'analysing',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = ? AND updated_at = ?
       RETURNING id`,
    )
    .bind(principal.ownerId, id, existing.status, existing.updated_at)
    .first<{ id: string }>();
  if (!locked) {
    throw new ApiError(
      409,
      "receipt_changed",
      "This receipt changed in another tab. Reopen it before saving.",
    );
  }

  try {
    const {
      appliedPatch,
      entries,
      assignments,
      values,
      missing,
      uncertain,
      provenance,
      projected,
    } = prepareReviewState(existing, patch, {
      tripExplicit: tripDecision.explicitlySelected,
      foreignReceipt,
      dateChanged,
      gbpValuesChanged,
      conversionStatus: currentConversion.status,
    });
    if (
      patch.originalCurrency &&
      patch.originalCurrency !== existing.original_currency
    ) {
      await applyCorrectedCurrency(
        principal,
        projected,
        patch.originalCurrency,
        missing,
        uncertain,
        assignments,
        values,
      );
    }
    const before = reviewRowValues(existing);
    const tripLink = await resolveReceiptTripLink(principal, {
    serviceDate: projected.service_date,
    tripId: projected.trip_id,
    tripLegId: projected.trip_leg_id,
    originalCountry: projected.original_country,
    provenance,
  });
    projected.trip_id = applyResolvedTripAssignment(
    assignments,
    values,
    projected.trip_id,
    tripLink.tripId,
  );
    projected.trip_leg_id = applyResolvedTripLegAssignment(
    assignments,
    values,
    projected.trip_leg_id,
    tripLink.tripLegId,
  );
  projected.correction_provenance_json = JSON.stringify(tripLink.provenance);
  const duplicates = await duplicateCandidateState(principal, id, {
    merchant: projected.merchant,
    serviceDate: projected.service_date,
    receiptTotalPence: projected.receipt_total_pence,
    originalCurrency: projected.original_currency,
    originalAmountMinor: projected.original_receipt_total_minor,
  });
  const identityChanged =
    projected.merchant !== existing.merchant ||
    projected.service_date !== existing.service_date ||
    projected.receipt_total_pence !== existing.receipt_total_pence;
  const duplicateReviewed =
    !duplicates.fingerprint ||
    (!identityChanged && appliedPatch.duplicateReviewed === true) ||
    (!("duplicateReviewed" in appliedPatch) &&
      existing.duplicate_reviewed_fingerprint === duplicates.fingerprint);
  projected.duplicate_candidates_json = JSON.stringify(duplicates.candidates);
  projected.duplicate_fingerprint = duplicates.fingerprint;
  projected.duplicate_reviewed = Number(duplicateReviewed);
  projected.duplicate_reviewed_fingerprint = duplicateReviewed
    ? duplicates.fingerprint
    : null;
  const status =
    unresolvedFields(projected).length ||
    receiptGroupReview(projected).pending ||
    (duplicates.candidates.length > 0 && !duplicateReviewed) ||
    reconciliationNeedsReview(projected) ||
    Boolean(tripLink.errorCode)
      ? "needs_review"
      : "ready";
  assignments.push(
    "duplicate_candidates_json = ?",
    "duplicate_fingerprint = ?",
    "duplicate_reviewed = ?",
    "duplicate_reviewed_fingerprint = ?",
    "status = ?",
  );
  values.push(
    projected.duplicate_candidates_json,
    projected.duplicate_fingerprint,
    projected.duplicate_reviewed,
    projected.duplicate_reviewed_fingerprint,
    status,
  );
  const db = database();
  const results = await db.batch([
    db.prepare(
      `UPDATE receipt_intakes
       SET ${assignments.join(", ")},
           missing_fields_json = ?,
           uncertain_fields_json = ?,
           correction_provenance_json = ?,
           error_code = ?,
           error_message = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL`,
    )
    .bind(
      ...values,
      JSON.stringify(missing),
      JSON.stringify(uncertain),
      JSON.stringify(tripLink.provenance),
      tripLink.errorCode,
      tripLink.errorMessage,
      principal.ownerId,
      id,
    ),
    receiptRevisionStatementAfterChange(principal, {
      intakeId: id,
      source,
      fields: tripRevisionFields(
        entries.map(([key]) => key),
        existing.trip_id,
        projected.trip_id,
      ),
      before,
      after: { ...before, ...appliedPatch, tripId: projected.trip_id },
    }),
    auditStatementAfterChange(principal, {
      action: source === "voice"
        ? "receipt_intake.voice_reviewed"
        : "receipt_intake.reviewed",
      entityType: "receipt_intake",
      entityId: id,
      metadata: { fieldsChanged: entries.length },
    }),
  ]);
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      409,
      "receipt_changed",
      "This receipt changed in another tab. Reopen it before saving.",
    );
  }
    return publicIntake(await requireIntake(principal, id));
  } catch (error) {
    await releaseReviewLock(principal, id, existing.status);
    throw error;
  }
}
