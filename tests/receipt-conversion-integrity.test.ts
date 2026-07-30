import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { frozenReceiptConversionIssue } from "../src/server/receipt-conversion-policy.ts";
import type { FrozenReceiptConversion } from "../src/server/receipt-conversion-policy";

function receipt(
  overrides: Partial<FrozenReceiptConversion> = {},
): FrozenReceiptConversion {
  return {
    originalCurrency: "EUR",
    serviceDate: "2026-07-29",
    originalReceiptTotalMinor: 1_000,
    originalEligibleMinor: 900,
    originalGratuityMinor: 100,
    originalMinorUnitDigits: 2,
    receiptTotalPence: 875,
    eligiblePence: 788,
    gratuityPence: 88,
    exchangeRateQuoteId: "quote-1",
    conversionJson: JSON.stringify({
      quoteId: "quote-1",
      provider: "ECB",
      requestedDate: "2026-07-29",
      observationDate: "2026-07-29",
      originalCurrency: "EUR",
      targetCurrency: "GBP",
      originalMinorUnitDigits: 2,
      rateNumerator: "7",
      rateDenominator: "8",
      receiptTotalMinor: 1_000,
      eligibleMinor: 900,
      gratuityMinor: 100,
      receiptTotalPence: 875,
      eligiblePence: 788,
      gratuityPence: 88,
    }),
    ...overrides,
  };
}

const quote = {
  id: "quote-1",
  provider: "ECB",
  baseCurrency: "EUR",
  quoteCurrency: "GBP",
  requestedDate: "2026-07-29",
  observationDate: "2026-07-29",
  rateNumerator: "7",
  rateDenominator: "8",
};
const expected = {
  receiptTotalPence: 875,
  eligiblePence: 788,
  gratuityPence: 88,
};

test("accepts GBP values recalculated exactly from the owner-scoped quote", () => {
  assert.equal(frozenReceiptConversionIssue(receipt(), quote, expected), null);
});

test("rejects a stale or tampered GBP conversion", () => {
  assert.match(
    frozenReceiptConversionIssue(
      receipt({ receiptTotalPence: 876 }),
      quote,
      expected,
    ) ?? "",
    /do not match/,
  );
});

test("accepts an explicit owner conversion only when no quote is attached", () => {
  const ownerConversion = receipt({
    exchangeRateQuoteId: null,
    receiptTotalPence: 860,
    eligiblePence: 774,
    gratuityPence: 86,
    conversionJson: JSON.stringify({
      status: "owner_override",
      provider: "owner",
      requestedDate: "2026-07-29",
      originalCurrency: "EUR",
      targetCurrency: "GBP",
      receiptTotalPence: 860,
      eligiblePence: 774,
      gratuityPence: 86,
    }),
  });
  assert.equal(
    frozenReceiptConversionIssue(ownerConversion, null, null),
    null,
  );
  assert.match(
    frozenReceiptConversionIssue(
      { ...ownerConversion, exchangeRateQuoteId: "quote-1" },
      quote,
      expected,
    ) ?? "",
    /incomplete or inconsistent/,
  );
});

test("requires identity equality for GBP receipts", () => {
  const gbpReceipt = receipt({
    originalCurrency: "GBP",
    originalReceiptTotalMinor: 1_000,
    originalEligibleMinor: 900,
    originalGratuityMinor: 100,
    receiptTotalPence: 1_000,
    eligiblePence: 900,
    gratuityPence: 100,
    exchangeRateQuoteId: null,
    conversionJson: JSON.stringify({ source: "identity" }),
  });
  assert.equal(frozenReceiptConversionIssue(gbpReceipt, null, null), null);
  assert.match(
    frozenReceiptConversionIssue(
      { ...gbpReceipt, eligiblePence: 899 },
      null,
      null,
    ) ?? "",
    /do not match/,
  );
});
