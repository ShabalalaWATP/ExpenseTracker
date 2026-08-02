import { allocateGroupReceipt } from "@/src/domain/group-receipt-allocation";
import {
  receiptGroupReview,
  type ReceiptIntakeRow,
} from "./receipt-intake-model";
import type { IntakePatch } from "./receipt-intake-validation";
import { reconcileReceiptIntake } from "./receipt-intake-reconciliation";

export function reviewJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
  originalCountry: "original_country",
  tripId: "trip_id",
  tripLegId: "trip_leg_id",
  alcoholReviewed: "alcohol_reviewed",
  reconciliationReviewed: "reconciliation_reviewed",
};

const evidenceField: Partial<Record<keyof IntakePatch, string>> = {
  merchant: "merchant",
  serviceDate: "service_date",
  receiptTotalPence: "receipt_total",
  eligiblePence: "eligible_amount",
  gratuityPence: "gratuity",
  location: "location",
  businessReason: "business_reason",
  mealContext: "meal_context",
  category: "category",
  originalCurrency: "original_currency",
  originalCountry: "original_country",
  tripId: "trip_id",
  tripLegId: "trip_leg_id",
  alcoholReviewed: "alcohol",
};

export function reviewRowValues(row: ReceiptIntakeRow) {
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
    tripLegId: row.trip_leg_id,
    alcoholReviewed: Boolean(row.alcohol_reviewed),
    duplicateReviewed: Boolean(row.duplicate_reviewed),
    reconciliationReviewed: Boolean(row.reconciliation_reviewed),
  };
}

export function reconciliationNeedsReview(row: ReceiptIntakeRow): boolean {
  return (
    reconcileReceiptIntake(row).status === "mismatch" &&
    !Boolean(row.reconciliation_reviewed)
  );
}

function patchValue<T>(value: T | undefined, current: T): T {
  return value === undefined ? current : value;
}

export function prepareReviewState(
  existing: ReceiptIntakeRow,
  patch: IntakePatch,
  options: {
    tripExplicit: boolean;
    foreignReceipt: boolean;
    dateChanged: boolean;
    gbpValuesChanged: boolean;
    conversionStatus?: string;
  },
) {
  const cleared = new Set(
    (Object.keys(patch) as (keyof IntakePatch)[])
      .map((key) => evidenceField[key])
      .filter((field): field is string => Boolean(field)),
  );
  if (options.tripExplicit) {
    cleared.add("trip_id");
    if (patch.tripLegId) cleared.add("trip_leg_id");
  }
  const missing = reviewJson<string[]>(
    existing.missing_fields_json,
    [],
  ).filter((field) => !cleared.has(field));
  const uncertain = reviewJson<string[]>(
    existing.uncertain_fields_json,
    [],
  ).filter((field) => !cleared.has(field));
  const provenance = reviewJson<
    Record<string, "ai" | "owner" | "auto">
  >(existing.correction_provenance_json, {});
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
    : { ...patch };
  delete appliedPatch.leaveTripUnlinked;
  const entries = Object.entries(appliedPatch) as [
    keyof IntakePatch,
    unknown,
  ][];
  const assignments: string[] = [];
  const values: unknown[] = [];
  let clarificationJson = existing.clarification_json;
  let lineItemsJson = existing.line_items_json;
  for (const [key, value] of entries) {
    if (
      key === "duplicateReviewed" ||
      key === "groupReceiptDecision" ||
      key === "groupReceiptSelectedItems" ||
      key === "groupReceiptSelectedQuantities" ||
      key === "groupReceiptPeopleCount" ||
      key === "groupReceiptAllocationMethod"
    ) continue;
    const column = patchColumns[key];
    if (!column) continue;
    assignments.push(`${column} = ?`);
    values.push(
      key === "alcoholReviewed" || key === "reconciliationReviewed"
        ? Number(value)
        : value,
    );
  }

  if (appliedPatch.groupReceiptDecision) {
    const group = receiptGroupReview(existing);
    clarificationJson = JSON.stringify({
      ...reviewJson<Record<string, unknown>>(
        existing.clarification_json ?? "{}",
        {},
      ),
      groupReceipt: {
        status: appliedPatch.groupReceiptDecision,
        fingerprint: group.fingerprint,
        selectedItems: appliedPatch.groupReceiptSelectedItems ?? [],
        selectedQuantities:
          appliedPatch.groupReceiptSelectedQuantities ?? [],
        peopleCount: appliedPatch.groupReceiptPeopleCount,
        allocationMethod: appliedPatch.groupReceiptAllocationMethod,
      },
    });
    assignments.push("clarification_json = ?");
    values.push(clarificationJson);
    provenance.group_receipt = "owner";
  }
  if (appliedPatch.groupReceiptDecision === "shared") {
    const lines = reviewJson<Array<Record<string, unknown>>>(
      existing.line_items_json,
      [],
    );
    const quantities = appliedPatch.groupReceiptSelectedQuantities ?? [];
    const group = receiptGroupReview(existing);
    const allocation = allocateGroupReceipt({
      lines: lines.map((line) => ({
        description:
          typeof line.description === "string" ? line.description : "",
        quantity: typeof line.quantity === "number" ? line.quantity : null,
        totalPence:
          typeof line.totalPence === "number" ? line.totalPence : null,
        eligible:
          typeof line.eligible === "boolean" ? line.eligible : null,
        groupOriginalEligible:
          typeof line.groupOriginalEligible === "boolean"
            ? line.groupOriginalEligible
            : null,
        alcoholSuspected: line.alcoholSuspected === true,
      })),
      selectedQuantities: quantities,
      peopleCount:
        appliedPatch.groupReceiptPeopleCount ?? group.peopleCount,
      method:
        appliedPatch.groupReceiptAllocationMethod ?? group.allocationMethod,
      serviceChargePence:
        existing.original_gratuity_minor ?? existing.gratuity_pence,
    });
    lineItemsJson = JSON.stringify(
      lines.map((line, index) => {
        const originalEligible =
          line.groupOriginalEligible ?? line.eligible;
        const claimedTotalPence = allocation.lineClaimsPence[index] ?? 0;
        return {
          ...line,
          groupOriginalEligible: originalEligible,
          claimedQuantity: quantities[index] ?? 0,
          claimedTotalPence,
          eligible:
            claimedTotalPence !== 0 &&
            line.alcoholSuspected !== true &&
            originalEligible !== false,
        };
      }),
    );
    assignments.push("line_items_json = ?");
    values.push(lineItemsJson);
  } else if (appliedPatch.groupReceiptDecision === "single") {
    const lines = reviewJson<Array<Record<string, unknown>>>(
      existing.line_items_json,
      [],
    );
    lineItemsJson = JSON.stringify(
      lines.map((entry) => {
        const line = { ...entry };
        const groupOriginalEligible = line.groupOriginalEligible;
        delete line.groupOriginalEligible;
        delete line.claimedQuantity;
        delete line.claimedTotalPence;
        return {
          ...line,
          eligible: groupOriginalEligible ?? line.eligible,
        };
      }),
    );
    assignments.push("line_items_json = ?");
    values.push(lineItemsJson);
  }

  let conversionOverride: string | null = null;
  if (
    options.foreignReceipt &&
    options.gbpValuesChanged &&
    options.conversionStatus === "unavailable" &&
    patch.conversionReviewed === true
  ) {
    conversionOverride = JSON.stringify({
      status: "owner_override",
      provider: "owner",
      requestedDate: existing.service_date,
      observationDate: null,
      originalCurrency: existing.original_currency,
      targetCurrency: "GBP",
      rateDisplay: "Owner-supplied GBP equivalent",
      rounding: "owner_supplied",
      receiptTotalPence:
        patch.receiptTotalPence ?? existing.receipt_total_pence,
      eligiblePence: patch.eligiblePence ?? existing.eligible_pence,
      gratuityPence: patch.gratuityPence ?? existing.gratuity_pence,
    });
    assignments.push("conversion_json = ?", "exchange_rate_quote_id = NULL");
    values.push(conversionOverride);
  }

  const projected = {
    ...existing,
    merchant: patchValue(appliedPatch.merchant, existing.merchant),
    service_date: patchValue(
      appliedPatch.serviceDate,
      existing.service_date,
    ),
    receipt_total_pence: patchValue(
      appliedPatch.receiptTotalPence,
      existing.receipt_total_pence,
    ),
    eligible_pence: patchValue(
      appliedPatch.eligiblePence,
      existing.eligible_pence,
    ),
    gratuity_pence: patchValue(
      appliedPatch.gratuityPence,
      existing.gratuity_pence,
    ),
    location: patchValue(appliedPatch.location, existing.location),
    business_reason: patchValue(
      appliedPatch.businessReason,
      existing.business_reason,
    ),
    meal_context: patchValue(
      appliedPatch.mealContext,
      existing.meal_context,
    ),
    category: patchValue(appliedPatch.category, existing.category),
    original_currency: patchValue(
      appliedPatch.originalCurrency,
      existing.original_currency,
    ),
    original_country: patchValue(
      appliedPatch.originalCountry,
      existing.original_country,
    ),
    trip_id: patchValue(appliedPatch.tripId, existing.trip_id),
    trip_leg_id:
      appliedPatch.tripLegId !== undefined
        ? appliedPatch.tripLegId
        : appliedPatch.tripId !== undefined &&
            appliedPatch.tripId !== existing.trip_id
          ? null
          : existing.trip_leg_id,
    alcohol_reviewed:
      appliedPatch.alcoholReviewed === undefined
        ? existing.alcohol_reviewed
        : Number(appliedPatch.alcoholReviewed),
    reconciliation_reviewed:
      appliedPatch.reconciliationReviewed === undefined
        ? existing.reconciliation_reviewed
        : Number(appliedPatch.reconciliationReviewed),
    missing_fields_json: JSON.stringify(missing),
    uncertain_fields_json: JSON.stringify(uncertain),
    correction_provenance_json: JSON.stringify(provenance),
    clarification_json: clarificationJson,
    line_items_json: lineItemsJson,
    conversion_json: conversionOverride ?? existing.conversion_json,
  } satisfies ReceiptIntakeRow;

  if (
    !options.foreignReceipt &&
    (options.dateChanged || options.gbpValuesChanged)
  ) {
    const preserveSharedEvidence =
      appliedPatch.groupReceiptDecision === "shared";
    if (!preserveSharedEvidence) {
      projected.original_receipt_total_minor = projected.receipt_total_pence;
      projected.original_eligible_minor = projected.eligible_pence;
      projected.original_gratuity_minor = projected.gratuity_pence;
      projected.original_minor_unit_digits = 2;
      assignments.push(
        "original_receipt_total_minor = ?",
        "original_eligible_minor = ?",
        "original_gratuity_minor = ?",
        "original_minor_unit_digits = 2",
      );
      values.push(
        projected.original_receipt_total_minor,
        projected.original_eligible_minor,
        projected.original_gratuity_minor,
      );
    }
    projected.conversion_json = JSON.stringify({
      status: "converted",
      source: "identity",
      provider: "identity",
      originalCurrency: "GBP",
      targetCurrency: "GBP",
      requestedDate: projected.service_date,
      observationDate: projected.service_date,
      rateDisplay: "1 GBP = 1 GBP",
      rounding: "half_up",
      receiptTotalPence: projected.receipt_total_pence,
      eligiblePence: projected.eligible_pence,
      gratuityPence: projected.gratuity_pence,
    });
    assignments.push("conversion_json = ?", "exchange_rate_quote_id = NULL");
    values.push(projected.conversion_json);
  }
  return {
    appliedPatch,
    entries,
    assignments,
    values,
    missing,
    uncertain,
    provenance,
    projected,
  };
}
