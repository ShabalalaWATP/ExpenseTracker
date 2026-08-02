import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import {
  allocateGroupReceipt,
  isServiceChargeLine,
} from "../src/domain/group-receipt-allocation.ts";

const lines = [
  { description: "4 x Coke", quantity: 4, totalPence: 800, eligible: true },
  { description: "2 x Burger", quantity: 2, totalPence: 2_000, eligible: true },
  { description: "+ S/C", quantity: null, totalPence: 300, eligible: true },
];

test("item allocation includes an equal share of the service charge", () => {
  const allocation = allocateGroupReceipt({
    lines,
    selectedQuantities: [1, 1, 0],
    peopleCount: 2,
    method: "items",
    serviceChargePence: 300,
  });
  assert.equal(allocation.serviceChargeSharePence, 150);
  assert.deepEqual(allocation.lineClaimsPence, [200, 1_000, 150]);
  assert.equal(allocation.totalPence, 1_350);
});

test("equal allocation divides the complete eligible bill", () => {
  const allocation = allocateGroupReceipt({
    lines,
    selectedQuantities: [],
    peopleCount: 2,
    method: "equal",
    serviceChargePence: 300,
  });
  assert.equal(allocation.serviceChargeSharePence, 150);
  assert.equal(allocation.totalPence, 1_550);
  assert.equal(
    allocation.lineClaimsPence.reduce((sum, value) => sum + value, 0),
    1_550,
  );
});

test("recognises printed service-charge descriptions", () => {
  assert.equal(isServiceChargeLine("Service charge"), true);
  assert.equal(isServiceChargeLine("+ S/C"), true);
  assert.equal(isServiceChargeLine("Chicken curry"), false);
});

test("adds a separately extracted service charge to either split method", () => {
  const foodOnlyLines = lines.slice(0, 2);
  for (const [method, expected] of [
    ["items", 1_350],
    ["equal", 1_550],
  ] as const) {
    const allocation = allocateGroupReceipt({
      lines: foodOnlyLines,
      selectedQuantities: [1, 1],
      peopleCount: 2,
      method,
      serviceChargePence: 300,
    });
    assert.equal(allocation.totalPence, expected);
    assert.equal(allocation.serviceChargeSharePence, 150);
  }
});
