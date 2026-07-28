import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { clarificationQuestions, normaliseExtraction } from "../src/server/receipt-extraction.ts";

describe("receipt extraction normalisation", () => {
  it("normalises a complete GBP receipt without changing integer pence", () => {
    const result = normaliseExtraction({
      merchant: "  Field Kitchen  ",
      service_date: "2026-08-12",
      receipt_total_pence: 2875,
      eligible_pence: 2445,
      gratuity_pence: 0,
      currency: "GBP",
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
  });

  it("rejects invalid dates, money and confidence without throwing", () => {
    const result = normaliseExtraction({
      service_date: "2026-02-30",
      receipt_total_pence: 12.5,
      eligible_pence: -1,
      gratuity_pence: "100",
      currency: "USD",
      line_items: [{ description: "", confidence: 8 }],
      confidence: { merchant: -4, receipt_total: 3 },
    });

    assert.equal(result.serviceDate, null);
    assert.equal(result.receiptTotalPence, null);
    assert.equal(result.eligiblePence, null);
    assert.equal(result.gratuityPence, 0);
    assert.equal(result.currency, "UNKNOWN");
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
