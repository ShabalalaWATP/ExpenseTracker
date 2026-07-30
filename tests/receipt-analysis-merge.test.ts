import assert from "node:assert/strict";
import { it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { chosen, mergedExtractionSnapshot, updateProvenance } from "../src/server/receipt-analysis-merge.ts";
import type {
  ReceiptExtraction,
  ReceiptField,
} from "../src/server/receipt-extraction";
import type { ReceiptIntakeRow } from "../src/server/receipt-intake-model";

const extraction = {
  merchant: "AI Merchant",
  serviceDate: "2026-08-12",
  transactionTime: "12:15",
  receiptTotalPence: 1_200,
  eligiblePence: 1_200,
  gratuityPence: 0,
  currency: "GBP",
  country: "GB",
  locationHint: "Portsmouth",
  businessReason: "Lunch at AI Merchant",
  mealContext: "lunch",
  category: "food",
  lineItems: [],
  alcoholSuspected: false,
  missingFields: [],
  uncertainFields: [],
  confidence: {},
} satisfies ReceiptExtraction;

it("preserves owner reason and meal corrections during full AI reanalysis", () => {
  const row = {
    business_reason: "Late watch handover",
    meal_context: "dinner",
  } as ReceiptIntakeRow;
  const provenance = {
    business_reason: "owner",
    meal_context: "owner",
  } as const;

  assert.equal(
    chosen(
      row,
      extraction,
      provenance,
      new Set(),
      "business_reason",
    ),
    "Late watch handover",
  );
  assert.equal(
    chosen(row, extraction, provenance, new Set(), "meal_context"),
    "dinner",
  );
  assert.deepEqual(
    updateProvenance(provenance, extraction, new Set()),
    expectOwnerFields(provenance),
  );
});

it("preserves non-targeted time and meal facts during a targeted recheck", () => {
  const row = {
    extraction_json: JSON.stringify({
      ...extraction,
      transactionTime: "18:45",
      mealContext: "dinner",
    }),
  } as ReceiptIntakeRow;
  const snapshot = mergedExtractionSnapshot(
    row,
    { ...extraction, merchant: "Rechecked merchant" },
    new Set<ReceiptField>(["merchant"]),
    { merchant: "Rechecked merchant" },
  );

  assert.equal(snapshot.merchant, "Rechecked merchant");
  assert.equal(snapshot.transactionTime, "18:45");
  assert.equal(snapshot.mealContext, "dinner");
});

function expectOwnerFields(provenance: {
  business_reason: "owner";
  meal_context: "owner";
}) {
  return {
    ...provenance,
    merchant: "ai",
    service_date: "ai",
    transaction_time: "ai",
    receipt_total: "ai",
    eligible_amount: "ai",
    location: "ai",
    alcohol: "ai",
    category: "ai",
    gratuity: "ai",
  };
}
