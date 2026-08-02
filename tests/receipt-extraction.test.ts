import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { clarificationQuestions, mealContextFromTime, normaliseExtraction, normaliseTransactionTime, RECEIPT_EXTRACTION_SCHEMA } from "../src/server/receipt-extraction.ts";

describe("receipt extraction normalisation", () => {
  it("requires original-minor amount fields consistently in the strict schema", () => {
    const lineItems = RECEIPT_EXTRACTION_SCHEMA.properties.line_items.items;
    assert.ok("total_minor" in lineItems.properties);
    assert.ok(lineItems.required.includes("total_minor"));
    assert.ok(!lineItems.required.includes("total_pence" as "total_minor"));
    assert.ok(
      RECEIPT_EXTRACTION_SCHEMA.required.includes("receipt_total_minor"),
    );
    assert.ok(
      RECEIPT_EXTRACTION_SCHEMA.required.includes("location_coordinates"),
    );
    assert.ok(
      RECEIPT_EXTRACTION_SCHEMA.required.includes("receipt_documents"),
    );
    assert.ok(lineItems.required.includes("document_index"));
  });

  it("adds two same-meal receipts from one photo using document subtotals", () => {
    const result = normaliseExtraction({
      receipt_total_minor: 999,
      eligible_minor: 999,
      gratuity_minor: 0,
      currency: "GBP",
      country: "GB",
      receipt_documents: [
        {
          document_index: 1,
          merchant: "Main Kitchen",
          service_date: "2026-08-02",
          transaction_time: "19:10",
          receipt_total_minor: 1_200,
          eligible_minor: 1_200,
          gratuity_minor: 0,
          currency: "GBP",
          country: "GB",
          location_hint: "Portsmouth",
          duplicate_of_document_index: null,
          line_item_indexes: [0],
        },
        {
          document_index: 2,
          merchant: "Dessert Counter",
          service_date: "2026-08-02",
          transaction_time: "19:22",
          receipt_total_minor: 800,
          eligible_minor: 800,
          gratuity_minor: 0,
          currency: "GBP",
          country: "GB",
          location_hint: "Portsmouth",
          duplicate_of_document_index: null,
          line_item_indexes: [1],
        },
      ],
      multi_receipt: {
        detected: true,
        same_meal: true,
        confidence: 0.97,
        reason: "Nearby times and complementary courses at the same venue.",
      },
      line_items: [
        { description: "Dinner", document_index: 1, total_minor: 1_200 },
        { description: "Dessert", document_index: 2, total_minor: 800 },
      ],
    });

    assert.equal(result.receiptTotalPence, 2_000);
    assert.equal(result.eligiblePence, 2_000);
    assert.equal(result.multiReceipt.sameMeal, true);
    assert.equal(result.receiptDocuments.length, 2);
    assert.equal(result.lineItems[1]?.documentIndex, 2);
  });

  it("keeps duplicate receipt copies but does not count them twice", () => {
    const document = {
      merchant: "Field Kitchen",
      service_date: "2026-08-02",
      transaction_time: "12:10",
      receipt_total_minor: 1_250,
      eligible_minor: 1_250,
      gratuity_minor: 0,
      currency: "GBP",
      country: "GB",
      location_hint: "London",
      line_item_indexes: [0],
    };
    const result = normaliseExtraction({
      receipt_total_minor: 2_500,
      eligible_minor: 2_500,
      currency: "GBP",
      country: "GB",
      receipt_documents: [
        { ...document, document_index: 1, duplicate_of_document_index: null },
        { ...document, document_index: 2, duplicate_of_document_index: 1 },
      ],
      multi_receipt: {
        detected: true,
        same_meal: true,
        confidence: 0.99,
        reason: "Customer and merchant copies of one transaction.",
      },
    });

    assert.equal(result.receiptTotalPence, 1_250);
    assert.equal(result.eligiblePence, 1_250);
    assert.equal(result.receiptDocuments[1]?.duplicateOfDocumentIndex, 1);
  });

  it("normalises a complete GBP receipt without changing integer pence", () => {
    const result = normaliseExtraction({
      merchant: "  Field Kitchen  ",
      service_date: "2026-08-12",
      receipt_total_pence: 2875,
      eligible_pence: 2445,
      gratuity_pence: 0,
      currency: "GBP",
      country: "GB",
      food_style_tags: ["sandwiches_wraps", "cold_drinks"],
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
    assert.deepEqual(result.foodStyleTags, [
      "sandwiches_wraps",
      "cold_drinks",
    ]);
  });

  it("keeps evidence-backed venue coordinates and rejects incomplete pairs", () => {
    const precise = normaliseExtraction({
      location_coordinates: {
        latitude: 50.80391,
        longitude: -1.08744,
        precision: "venue",
        evidence: "Printed branch address",
      },
    });
    assert.deepEqual(precise.locationCoordinates, {
      latitude: 50.80391,
      longitude: -1.08744,
      precision: "venue",
      evidence: "Printed branch address",
    });
    assert.equal(normaliseExtraction({
      location_coordinates: {
        latitude: 50.8,
        longitude: null,
        precision: "venue",
        evidence: null,
      },
    }).locationCoordinates, null);
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
    assert.equal(result.currency, "USD");
    assert.equal(result.country, "FR");
    assert.equal(result.language, "und");
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

  it("keeps only unique controlled food-style tags", () => {
    const result = normaliseExtraction({
      food_style_tags: [
        "fried_chicken",
        "fried_chicken",
        "invented",
        "burgers",
        "pizza",
        "seafood",
      ],
    });

    assert.deepEqual(result.foodStyleTags, [
      "fried_chicken",
      "burgers",
      "pizza",
    ]);
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
