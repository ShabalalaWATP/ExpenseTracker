import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { clarificationQuestions, mealContextFromTime, normaliseExtraction, normaliseTransactionTime } from "../src/server/receipt-extraction.ts";

describe("receipt extraction normalisation", () => {
  it("normalises a complete GBP receipt without changing integer pence", () => {
    const result = normaliseExtraction({
      merchant: "  Field Kitchen  ",
      service_date: "2026-08-12",
      receipt_total_pence: 2875,
      eligible_pence: 2445,
      gratuity_pence: 0,
      currency: "GBP",
      country: "GB",
      location_hint: "Portsmouth",
      line_items: [
        {
          description: "Lunch",
          quantity: 1,
          total_pence: 2445,
          eligible: true,
          alcohol_suspected: false,
          confidence: 0.97,
        },
      ],
      alcohol_suspected: false,
      missing_fields: [],
      uncertain_fields: [],
      confidence: {
        merchant: 0.98,
        service_date: 0.99,
        receipt_total: 0.98,
        eligible_amount: 0.96,
        line_items: 0.95,
      },
    });

    assert.equal(result.merchant, "Field Kitchen");
    assert.equal(result.receiptTotalPence, 2875);
    assert.equal(result.eligiblePence, 2445);
    assert.equal(result.lineItems[0]?.totalPence, 2445);
    assert.equal(result.currency, "GBP");
    assert.equal(result.country, "GB");
  });

  it("rejects invalid dates, money and confidence without throwing", () => {
    const result = normaliseExtraction({
      service_date: "2026-02-30",
      receipt_total_pence: 12.5,
      eligible_pence: -1,
      gratuity_pence: "100",
      currency: "USD",
      country: "FR",
      line_items: [{ description: "", confidence: 8 }],
      confidence: { merchant: -4, receipt_total: 3 },
    });

    assert.equal(result.serviceDate, null);
    assert.equal(result.receiptTotalPence, null);
    assert.equal(result.eligiblePence, null);
    assert.equal(result.gratuityPence, 0);
    assert.equal(result.currency, "UNKNOWN");
    assert.equal(result.country, "UNKNOWN");
    assert.equal(result.lineItems[0]?.description, "Unrecognised item");
    assert.equal(result.lineItems[0]?.confidence, 1);
    assert.equal(result.confidence.merchant, 0);
    assert.equal(result.confidence.receiptTotal, 1);
  });

  it("keeps alcohol ambiguity explicit for human review", () => {
    const result = normaliseExtraction({
      alcohol_suspected: true,
      missing_fields: ["alcohol", "merchant", "unsupported"],
      uncertain_fields: ["eligible_amount", "alcohol"],
    });

    assert.equal(result.alcoholSuspected, true);
    assert.deepEqual(result.missingFields, ["alcohol", "merchant"]);
    assert.deepEqual(result.uncertainFields, ["eligible_amount", "alcohol"]);
  });

  it("validates HH:mm and assigns the exact food time bands", () => {
    assert.equal(normaliseTransactionTime("04:59"), "04:59");
    assert.equal(normaliseTransactionTime("24:00"), null);
    assert.equal(normaliseTransactionTime("9:30"), null);
    assert.equal(normaliseTransactionTime("12:60"), null);

    assert.equal(mealContextFromTime("food", "04:59"), "snack");
    assert.equal(mealContextFromTime("food", "05:00"), "breakfast");
    assert.equal(mealContextFromTime("food", "10:59"), "breakfast");
    assert.equal(mealContextFromTime("food", "11:00"), "lunch");
    assert.equal(mealContextFromTime("food", "15:59"), "lunch");
    assert.equal(mealContextFromTime("food", "16:00"), "dinner");
    assert.equal(mealContextFromTime("food", "22:59"), "dinner");
    assert.equal(mealContextFromTime("food", "23:00"), "snack");
  });

  it("never applies a meal context without a food classification", () => {
    assert.equal(mealContextFromTime("taxi", "12:30", "lunch"), null);
    assert.equal(mealContextFromTime(null, "12:30", "lunch"), null);

    const result = normaliseExtraction({
      category: "public_transport",
      transaction_time: "08:15",
      meal_context: "breakfast",
      business_reason: " Rail fare from Portsmouth ",
      confidence: {
        transaction_time: 0.98,
        meal_context: 0.95,
        business_reason: 0.91,
      },
    });
    assert.equal(result.transactionTime, "08:15");
    assert.equal(result.mealContext, null);
    assert.equal(result.businessReason, "Rail fare from Portsmouth");
    assert.equal(result.confidence.transactionTime, 0.98);
    assert.equal(result.confidence.mealContext, 0.95);
    assert.equal(result.confidence.businessReason, 0.91);
  });
});

describe("clarification questions", () => {
  it("deduplicates allowlisted questions and ignores unknown fields", () => {
    assert.deepEqual(
      clarificationQuestions([
        "location",
        "location",
        "unknown",
        "business_reason",
      ]),
      [
        "Where were you when this expense was incurred?",
        "Why was this expense necessary for duty?",
      ],
    );
  });
});
