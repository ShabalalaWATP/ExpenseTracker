import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { reconcileReceipt } from "../src/domain/receipt-reconciliation.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import {
  reconciliationLines,
  sharedReceiptServiceAdjustment,
} from "../src/domain/receipt-reconciliation-lines.ts";

describe("receipt arithmetic reconciliation", () => {
  it("balances visible items including a signed discount", () => {
    const result = reconcileReceipt(
      [
        { totalPence: 900, eligible: true },
        { totalPence: 500, eligible: true },
        { totalPence: -200, eligible: true },
      ],
      1200,
      1200,
      0,
    );
    assert.equal(result.status, "balanced");
    assert.equal(result.receiptDifferencePence, 0);
  });

  it("requires review when line items do not match the receipt total", () => {
    const result = reconcileReceipt(
      [{ totalPence: 900, eligible: true }],
      1200,
      900,
      0,
    );
    assert.equal(result.status, "mismatch");
    assert.match(result.issues.join(" "), /do not (?:match|add up)/i);
  });

  it("reports incomplete arithmetic when item amounts are unknown", () => {
    const result = reconcileReceipt(
      [{ totalPence: null, eligible: null }],
      1200,
      1200,
      0,
    );
    assert.equal(result.status, "incomplete");
    assert.equal(result.unknownAmountCount, 1);
  });

  it("requires review when known eligible lines do not match the eligible amount", () => {
    const result = reconcileReceipt(
      [
        { totalPence: 500, eligible: true },
        { totalPence: 500, eligible: false },
      ],
      1000,
      1000,
      0,
    );
    assert.equal(result.status, "mismatch");
    assert.equal(result.eligibleDifferencePence, 500);
    assert.match(result.issues.join(" "), /eligible line items/i);
  });

  it("reconciles a selected quantity without changing the full receipt total", () => {
    const result = reconcileReceipt(
      [
        {
          totalPence: 800,
          eligible: true,
          claimedTotalPence: 200,
        },
      ],
      800,
      200,
      0,
    );
    assert.equal(result.status, "balanced");
    assert.equal(result.knownLineTotalPence, 800);
    assert.equal(result.knownEligibleLineTotalPence, 200);
  });

  it("preserves claimed line totals when confirmation reads stored JSON", () => {
    const lines = reconciliationLines(JSON.stringify([
      {
        totalPence: 600,
        eligible: true,
        claimedQuantity: 2,
        claimedTotalPence: 200,
      },
      {
        totalPence: 1_795,
        eligible: true,
        claimedQuantity: 1,
        claimedTotalPence: 598,
      },
      {
        totalPence: 3_190,
        eligible: true,
        claimedQuantity: 1,
        claimedTotalPence: 3_190,
      },
      { totalPence: 5_170, eligible: false, claimedTotalPence: 0 },
    ]));
    const result = reconcileReceipt(lines, 10_755, 3_988, 1_185);
    assert.equal(result.status, "balanced");
    assert.equal(result.knownEligibleLineTotalPence, 3_988);
    assert.equal(result.eligibleDifferencePence, 0);
  });

  it("reconciles an externally allocated service-charge share", () => {
    const storedLines = JSON.stringify([
      { totalPence: 2_800, eligible: true, claimedTotalPence: 1_200 },
    ]);
    const adjustment = sharedReceiptServiceAdjustment(
      storedLines,
      1_350,
      150,
      true,
    );
    const result = reconcileReceipt(
      reconciliationLines(storedLines),
      2_800,
      1_350,
      150,
      adjustment,
    );
    assert.equal(adjustment, 150);
    assert.equal(result.status, "balanced");
    assert.equal(result.knownEligibleLineTotalPence, 1_350);
  });
});
