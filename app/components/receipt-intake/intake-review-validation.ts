import { parsePence } from "../format";
import type { ExpenseCategory, MealContext } from "../types";
import type { IntakePatch } from "./types";

export function pounds(pence: number | null): string {
  return pence === null ? "" : (pence / 100).toFixed(2);
}

export function buildIntakePatch(input: {
  merchant: string;
  date: string;
  total: string;
  eligible: string;
  gratuity: string;
  location: string;
  reason: string;
  meal: MealContext;
  category: ExpenseCategory | "";
  alcoholReviewed: boolean;
  duplicateReviewed: boolean;
  reconciliationReviewed: boolean;
  conversionReviewed: boolean;
  originalCurrency: string;
  initialCurrency: string;
  originalCountry: string;
  initialCountry: string;
  tripDecision: "unchanged" | "selected" | "leave_unlinked";
  tripId: string;
  tripLegId: string;
}): IntakePatch {
  const review: IntakePatch = {
    merchant: input.merchant.trim() || null,
    serviceDate: input.date || null,
    receiptTotalPence: parsePence(input.total),
    eligiblePence: parsePence(input.eligible),
    gratuityPence: parsePence(input.gratuity),
    location: input.location.trim() || null,
    businessReason: input.reason.trim() || null,
    mealContext: input.meal || null,
    category: input.category || null,
    alcoholReviewed: input.alcoholReviewed,
    duplicateReviewed: input.duplicateReviewed,
    reconciliationReviewed: input.reconciliationReviewed,
    conversionReviewed: input.conversionReviewed,
  };
  if (input.originalCurrency !== input.initialCurrency) {
    review.originalCurrency = input.originalCurrency;
  }
  if (input.originalCountry !== input.initialCountry) {
    review.originalCountry = input.originalCountry;
  }
  if (review.receiptTotalPence === null) delete review.receiptTotalPence;
  if (review.eligiblePence === null) delete review.eligiblePence;
  if (input.tripDecision === "selected") {
    review.tripId = input.tripId;
    review.tripLegId = input.tripLegId;
  } else if (input.tripDecision === "leave_unlinked") {
    review.tripId = null;
    review.leaveTripUnlinked = true;
  }
  return review;
}

export function validateIntakeReview(input: {
  merchant: string;
  date: string;
  location: string;
  reason: string;
  total: string;
  eligible: string;
  gratuity: string;
  allowMissingTotals?: boolean;
}): string {
  const receiptTotal = parsePence(input.total);
  const eligibleTotal = parsePence(input.eligible);
  const gratuityTotal = parsePence(input.gratuity);
  if (
    !input.merchant.trim() ||
    !input.date ||
    !input.location.trim() ||
    !input.reason.trim()
  ) {
    return "Complete the merchant, date, location and business reason.";
  }
  if (
    !input.allowMissingTotals &&
    (!receiptTotal || receiptTotal < 1 || !eligibleTotal || eligibleTotal < 1)
  ) {
    return "Enter valid receipt and eligible totals.";
  }
  if (input.allowMissingTotals && receiptTotal === null && eligibleTotal === null) {
    return "";
  }
  if (!Number.isSafeInteger(gratuityTotal) || gratuityTotal < 0) {
    return "Enter a valid service charge or tip.";
  }
  if (eligibleTotal > receiptTotal) {
    return "The eligible amount cannot exceed the receipt total.";
  }
  if (gratuityTotal > eligibleTotal) {
    return "The service charge or tip cannot exceed the eligible amount.";
  }
  return "";
}
