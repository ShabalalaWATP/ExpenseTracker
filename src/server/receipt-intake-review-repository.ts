import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { auditStatementAfterChange } from "./audit-repository";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { duplicateCandidateState } from "./receipt-duplicates";
import {
  publicIntake,
  unresolvedFields,
  type ReceiptIntakeRow,
} from "./receipt-intake-model";
import { requireIntake } from "./receipt-intake-repository";
import { receiptRevisionStatementAfterChange } from "./receipt-intake-revisions";
import type { IntakePatch } from "./receipt-intake-validation";

function json<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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

const patchColumns: Partial<Record<keyof IntakePatch, string>> = {
  merchant: "merchant",
  serviceDate: "service_date",
  receiptTotalPence: "receipt_total_pence",
  eligiblePence: "eligible_pence",
  gratuityPence: "gratuity_pence",
  location: "location",
  businessReason: "business_reason",
  mealContext: "meal_context",
  category: "category",
  tripId: "trip_id",
  alcoholReviewed: "alcohol_reviewed",
  reconciliationReviewed: "reconciliation_reviewed",
};

const fieldForPatch: Partial<Record<keyof IntakePatch, string>> = {
  merchant: "merchant",
  serviceDate: "service_date",
  receiptTotalPence: "receipt_total",
  eligiblePence: "eligible_amount",
  gratuityPence: "gratuity",
  location: "location",
  businessReason: "business_reason",
  mealContext: "meal_context",
  category: "category",
  tripId: "trip_id",
  alcoholReviewed: "alcohol",
};

function rowValues(row: Awaited<ReturnType<typeof requireIntake>>) {
  return {
    merchant: row.merchant,
    serviceDate: row.service_date,
    receiptTotalPence: row.receipt_total_pence,
    eligiblePence: row.eligible_pence,
    gratuityPence: row.gratuity_pence,
    location: row.location,
    businessReason: row.business_reason,
    mealContext: row.meal_context,
    category: row.category,
    tripId: row.trip_id,
    alcoholReviewed: Boolean(row.alcohol_reviewed),
    duplicateReviewed: Boolean(row.duplicate_reviewed),
    reconciliationReviewed: Boolean(row.reconciliation_reviewed),
  };
}

function reconciliationNeedsReview(
  row: Awaited<ReturnType<typeof requireIntake>>,
): boolean {
  const lines = json<Array<{ totalPence: number | null; eligible: boolean | null }>>(
    row.line_items_json,
    [],
  );
  return (
    reconcileReceipt(
      lines,
      row.receipt_total_pence,
      row.eligible_pence,
      row.gratuity_pence,
    ).status === "mismatch" && !Boolean(row.reconciliation_reviewed)
  );
}

export async function updateReceiptIntake(
  principal: Principal,
  id: string,
  patch: IntakePatch,
  source: "manual" | "voice" = "manual",
) {
  const existing = await requireIntake(principal, id);
  if (existing.status === "confirmed") {
    throw new ApiError(409, "receipt_confirmed", "This receipt is already confirmed.");
  }
  if (existing.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before editing it.",
    );
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
  const cleared = new Set(
    (Object.keys(patch) as (keyof IntakePatch)[])
      .map((key) => fieldForPatch[key])
      .filter((field): field is string => Boolean(field)),
  );
  const missing = json<string[]>(existing.missing_fields_json, []).filter(
    (field) => !cleared.has(field),
  );
  const uncertain = json<string[]>(existing.uncertain_fields_json, []).filter(
    (field) => !cleared.has(field),
  );
  const provenance = json<Record<string, "ai" | "owner">>(
    existing.correction_provenance_json,
    {},
  );
  for (const field of cleared) provenance[field] = "owner";

  const arithmeticChanged =
    ("receiptTotalPence" in patch &&
      patch.receiptTotalPence !== existing.receipt_total_pence) ||
    ("eligiblePence" in patch &&
      patch.eligiblePence !== existing.eligible_pence) ||
    ("gratuityPence" in patch &&
      patch.gratuityPence !== existing.gratuity_pence);
  const appliedPatch: IntakePatch = arithmeticChanged
    ? { ...patch, reconciliationReviewed: false }
    : patch;
  const entries = Object.entries(appliedPatch) as [keyof IntakePatch, unknown][];
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of entries) {
    if (key === "duplicateReviewed") continue;
    const column = patchColumns[key];
    if (!column) continue;
    assignments.push(`${column} = ?`);
    values.push(
      key === "alcoholReviewed" || key === "reconciliationReviewed"
        ? Number(value)
        : value,
    );
  }
  const before = rowValues(existing);
  const projected = {
    ...existing,
    merchant: appliedPatch.merchant === undefined
      ? existing.merchant
      : appliedPatch.merchant,
    service_date: appliedPatch.serviceDate === undefined
      ? existing.service_date
      : appliedPatch.serviceDate,
    receipt_total_pence: appliedPatch.receiptTotalPence === undefined
      ? existing.receipt_total_pence
      : appliedPatch.receiptTotalPence,
    eligible_pence: appliedPatch.eligiblePence === undefined
      ? existing.eligible_pence
      : appliedPatch.eligiblePence,
    gratuity_pence: appliedPatch.gratuityPence === undefined
      ? existing.gratuity_pence
      : appliedPatch.gratuityPence,
    location: appliedPatch.location === undefined
      ? existing.location
      : appliedPatch.location,
    business_reason: appliedPatch.businessReason === undefined
      ? existing.business_reason
      : appliedPatch.businessReason,
    meal_context: appliedPatch.mealContext === undefined
      ? existing.meal_context
      : appliedPatch.mealContext,
    category: appliedPatch.category === undefined
      ? existing.category
      : appliedPatch.category,
    trip_id: appliedPatch.tripId === undefined
      ? existing.trip_id
      : appliedPatch.tripId,
    alcohol_reviewed: appliedPatch.alcoholReviewed === undefined
      ? existing.alcohol_reviewed
      : Number(appliedPatch.alcoholReviewed),
    reconciliation_reviewed:
      appliedPatch.reconciliationReviewed === undefined
        ? existing.reconciliation_reviewed
        : Number(appliedPatch.reconciliationReviewed),
    missing_fields_json: JSON.stringify(missing),
    uncertain_fields_json: JSON.stringify(uncertain),
    correction_provenance_json: JSON.stringify(provenance),
  } satisfies ReceiptIntakeRow;
  const duplicates = await duplicateCandidateState(principal, id, {
    merchant: projected.merchant,
    serviceDate: projected.service_date,
    receiptTotalPence: projected.receipt_total_pence,
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
    (duplicates.candidates.length > 0 && !duplicateReviewed) ||
    reconciliationNeedsReview(projected)
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
           error_code = NULL,
           error_message = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL`,
    )
    .bind(
      ...values,
      JSON.stringify(missing),
      JSON.stringify(uncertain),
      JSON.stringify(provenance),
      principal.ownerId,
      id,
    ),
    receiptRevisionStatementAfterChange(principal, {
      intakeId: id,
      source,
      fields: entries.map(([key]) => key),
      before,
      after: { ...before, ...appliedPatch },
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
