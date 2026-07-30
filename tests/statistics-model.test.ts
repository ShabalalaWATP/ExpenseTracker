import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { buildStatistics } from "../app/components/statistics-model.ts";
import type { Expense } from "../app/components/types.ts";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: crypto.randomUUID(),
    date: "2026-08-12",
    merchant: "Café North",
    receiptTotalPence: 1200,
    eligibleAmountPence: 1000,
    claimableAmountPence: 0,
    country: "GB",
    originalCountry: "UNKNOWN",
    location: "London",
    reason: "Working away",
    mealContext: "lunch",
    category: "food",
    receiptStatus: "stored",
    ...overrides,
  };
}

describe("statistics model", () => {
  it("scopes all figures to the selected month and preserves zero claimable", () => {
    const model = buildStatistics([
      expense(),
      expense({
        id: "september",
        date: "2026-09-01",
        eligibleAmountPence: 9000,
        claimableAmountPence: 9000,
      }),
      expense({
        id: "deleted",
        deletedAt: "2026-08-13T00:00:00Z",
        eligibleAmountPence: 5000,
      }),
    ], "2026-08");
    assert.equal(model.expenses.length, 1);
    assert.equal(model.totalPence, 1000);
    assert.equal(model.claimablePence, 0);
    assert.equal(model.receiptCoverage, 100);
  });

  it("builds restaurant, food, meal, daily and location rankings", () => {
    const model = buildStatistics([
      expense(),
      expense({
        id: "second",
        merchant: "Café North",
        date: "2026-08-13",
        mealContext: "breakfast",
      }),
      expense({
        id: "third",
        merchant: "Sushi House",
        location: "Tokyo",
        country: "GB",
        originalCountry: "JP",
        mealContext: "dinner",
      }),
    ], "2026-08");
    assert.deepEqual(
      model.restaurants.map((item: { label: string; count: number }) => [
        item.label,
        item.count,
      ]),
      [["Café North", 2], ["Sushi House", 1]],
    );
    assert.equal(model.foodTypes[0].label, "Café & coffee");
    assert.equal(model.mealTypes.length, 3);
    assert.equal(model.daily[11].count, 2);
    assert.equal(
      model.locations.find((item: { label: string }) => item.label === "Tokyo")
        ?.countryCode,
      "JP",
    );
    assert.equal(
      model.countries.find(
        (item: { countryCode: string }) => item.countryCode === "GB",
      )?.count,
      2,
    );
  });

  it("returns stable zero values for an empty month", () => {
    const model = buildStatistics([], "2026-08");
    assert.equal(model.totalPence, 0);
    assert.equal(model.receiptCoverage, 0);
    assert.equal(model.daily.length, 31);
    assert.deepEqual(model.locations, []);
  });
});
