import type { IntakePatch, ReceiptIntake } from "./types";

const nullableTextFields = new Set<keyof IntakePatch>([
  "merchant",
  "serviceDate",
  "location",
  "businessReason",
]);

const nullableMoneyFields = new Set<keyof IntakePatch>([
  "receiptTotalPence",
  "eligiblePence",
]);

export function buildPreRecheckPatch(
  review: IntakePatch,
  current: IntakePatch,
): IntakePatch {
  const patch: IntakePatch = {};
  for (const [key, value] of Object.entries(review) as [
    keyof IntakePatch,
    IntakePatch[keyof IntakePatch],
  ][]) {
    if (nullableTextFields.has(key) && value === null) continue;
    if (nullableMoneyFields.has(key) && value === null) continue;
    if (key === "originalCurrency" && !/^[A-Z]{3}$/.test(String(value))) {
      continue;
    }
    if (key === "originalCountry" && !/^[A-Z]{2}$/.test(String(value))) {
      continue;
    }
    if (
      key !== "leaveTripUnlinked" &&
      Object.is(value, current[key])
    ) {
      continue;
    }
    Object.assign(patch, { [key]: value });
  }
  return patch;
}

export function currentIntakePatch(intake: ReceiptIntake): IntakePatch {
  return {
    merchant: intake.merchant,
    serviceDate: intake.serviceDate,
    receiptTotalPence: intake.receiptTotalPence,
    eligiblePence: intake.eligiblePence,
    gratuityPence: intake.gratuityPence,
    location: intake.location,
    businessReason: intake.businessReason,
    mealContext: intake.mealContext,
    category: intake.category,
    originalCurrency: intake.originalCurrency,
    originalCountry: intake.originalCountry,
    tripId: intake.tripId,
    tripLegId: intake.tripLegId,
    alcoholReviewed: intake.alcoholReviewed,
    duplicateReviewed: intake.duplicateReviewed,
    reconciliationReviewed: intake.reconciliationReviewed,
    conversionReviewed: false,
  };
}
