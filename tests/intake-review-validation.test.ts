import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { buildPreRecheckPatch } from "../app/components/receipt-intake/pre-recheck-patch.ts";

const failedReview = {
  merchant: null,
  serviceDate: null,
  receiptTotalPence: null,
  eligiblePence: null,
  gratuityPence: 0,
  location: null,
  businessReason: null,
  mealContext: null,
  category: null,
  alcoholReviewed: false,
  duplicateReviewed: false,
  reconciliationReviewed: false,
  conversionReviewed: false,
  originalCurrency: "UNKNOWN",
  originalCountry: "UNKNOWN",
  tripId: null,
  tripLegId: null,
};

test("a failed extraction can be retried without saving invalid blanks", () => {
  const patch = buildPreRecheckPatch(failedReview, failedReview);
  assert.deepEqual(patch, {});
});

test("valid owner corrections are preserved before a targeted recheck", () => {
  const review = {
    ...failedReview,
    merchant: "Field Kitchen",
    originalCurrency: "GBP",
  };
  assert.deepEqual(buildPreRecheckPatch(review, failedReview), {
    merchant: "Field Kitchen",
    originalCurrency: "GBP",
  });
});
