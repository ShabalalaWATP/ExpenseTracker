import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { reconcileReceipt } from "../src/domain/receipt-reconciliation.ts";

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
});
