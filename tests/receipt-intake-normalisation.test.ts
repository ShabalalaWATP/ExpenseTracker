import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { normaliseReceiptIntake } from "../app/components/receipt-intake/receiptApi.ts";

test("normalises missing receipt collections from older API records", () => {
  const intake = normaliseReceiptIntake({
    id: "receipt-1",
    originalCurrency: "GBP",
    originalCountry: "GB",
  });

  assert.equal(intake.errorCode, null);
  assert.deepEqual(intake.analysisHistory, []);
  assert.deepEqual(intake.clarificationQuestions, []);
  assert.deepEqual(intake.duplicateCandidates, []);
  assert.deepEqual(intake.lineItems, []);
  assert.deepEqual(intake.receiptDocuments, []);
  assert.equal(intake.multiReceipt.detected, false);
  assert.deepEqual(intake.missingFields, []);
  assert.deepEqual(intake.uncertainFields, []);
  assert.deepEqual(intake.confidence, {});
  assert.deepEqual(intake.correctionProvenance, {});
  assert.deepEqual(intake.imageEdits, {});
});

test("normalises multi-receipt evidence for review", () => {
  const intake = normaliseReceiptIntake({
    receiptDocuments: [
      {
        documentIndex: 1,
        merchant: "Cafe",
        receiptTotalPence: 800,
        eligiblePence: 800,
        gratuityPence: 0,
        currency: "GBP",
        country: "GB",
        duplicateOfDocumentIndex: null,
        lineItemIndexes: [0],
      },
      {
        documentIndex: 2,
        merchant: "Dessert bar",
        receiptTotalPence: 450,
        eligiblePence: 450,
        gratuityPence: 0,
        currency: "GBP",
        country: "GB",
        duplicateOfDocumentIndex: null,
        lineItemIndexes: [1],
      },
    ],
    multiReceipt: {
      detected: true,
      sameMeal: true,
      confidence: 0.96,
      reason: "Same place and time",
    },
  });

  assert.equal(intake.receiptDocuments.length, 2);
  assert.equal(intake.multiReceipt.detected, true);
  assert.equal(intake.multiReceipt.sameMeal, true);
});

test("normalises the typed receipt failure code", () => {
  const intake = normaliseReceiptIntake({
    errorCode: "openai_failed",
    error: "AI could not analyse this receipt.",
  });
  assert.equal(intake.errorCode, "openai_failed");
});

test("normalises incomplete analysis history entries before rendering", () => {
  const intake = normaliseReceiptIntake({
    analysisHistory: [
      {
        analysedAt: "2026-07-30T14:00:00.000Z",
        model: "receipt-model",
        extraction: { merchant: "Cafe" },
      },
      { model: "missing-date", extraction: {} },
    ],
  });

  assert.equal(intake.analysisHistory.length, 1);
  assert.deepEqual(intake.analysisHistory[0]?.targetedFields, []);
  assert.equal(intake.analysisHistory[0]?.extraction.merchant, "Cafe");
});
