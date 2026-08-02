import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import {
  allocatedReceiptLineTotal,
  assessGroupReceipt,
  groupReceiptState,
  receiptLineQuantity,
} from "../src/domain/group-receipt.ts";

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

test("allocates one item from a repeated receipt line", () => {
  const line = { description: "4 x Coke", quantity: null };
  assert.equal(receiptLineQuantity(line), 4);
  assert.equal(allocatedReceiptLineTotal(800, 4, 1), 200);
  assert.equal(allocatedReceiptLineTotal(800, 4, 3), 600);
  assert.equal(allocatedReceiptLineTotal(-200, 1, 1), -200);
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
  assert.deepEqual(reviewed.selectedQuantities, [0, 0]);
  assert.equal(
    groupReceiptState([...lines, { description: "Coke", quantity: 2 }], {
      status: "single",
      fingerprint: pending.fingerprint,
    }).pending,
    true,
  );
});

test("restores saved quantities and upgrades whole-line legacy selections", () => {
  const lines = [
    { description: "Burger", quantity: 3, totalPence: 2_100 },
    { description: "Coke", quantity: 4, totalPence: 800 },
  ];
  const pending = groupReceiptState(lines, null);
  const selected = groupReceiptState(lines, {
    status: "shared",
    fingerprint: pending.fingerprint,
    selectedItems: [0, 1],
    selectedQuantities: [1, 1],
  });
  assert.deepEqual(selected.selectedQuantities, [1, 1]);
  const legacy = groupReceiptState(lines, {
    status: "shared",
    fingerprint: pending.fingerprint,
    selectedItems: [0],
  });
  assert.deepEqual(legacy.selectedQuantities, [3, 0]);
});
