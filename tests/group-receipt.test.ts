import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { assessGroupReceipt, groupReceiptState } from "../src/domain/group-receipt.ts";

test("flags repeated meal sets as a likely shared receipt", () => {
  const result = assessGroupReceipt([
    { description: "Burger", quantity: 2 },
    { description: "Fries", quantity: 2 },
    { description: "Coke", quantity: 2 },
  ]);
  assert.equal(result.likelyShared, true);
  assert.equal(result.estimatedPeople, 2);
});

test("does not flag a plausible single-person burger meal with extras", () => {
  const result = assessGroupReceipt([
    { description: "Burger", quantity: 1 },
    { description: "Fries", quantity: 1 },
    { description: "Chicken strips", quantity: 1 },
    { description: "Drink", quantity: 1 },
  ]);
  assert.equal(result.likelyShared, false);
});

test("flags an unusually large order and understands printed quantities", () => {
  const result = assessGroupReceipt([
    { description: "4 x Burger", quantity: null },
    { description: "4 x Fries", quantity: null },
    { description: "2 x Lemonade", quantity: null },
  ]);
  assert.equal(result.likelyShared, true);
  assert.ok(result.foodUnits >= 10);
});

test("a review applies only to the exact extracted line items", () => {
  const lines = [
    { description: "Burger", quantity: 2, totalPence: 1_800 },
    { description: "Fries", quantity: 2, totalPence: 700 },
  ];
  const pending = groupReceiptState(lines, null);
  assert.equal(pending.pending, true);
  const reviewed = groupReceiptState(lines, {
    status: "single",
    fingerprint: pending.fingerprint,
  });
  assert.equal(reviewed.pending, false);
  assert.equal(reviewed.reviewed, true);
  assert.equal(
    groupReceiptState([...lines, { description: "Coke", quantity: 2 }], {
      status: "single",
      fingerprint: pending.fingerprint,
    }).pending,
    true,
  );
});
