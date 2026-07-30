import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { calculateJsp752, type PolicyExpense, type PolicyTrip } from "../src/domain/jsp752.ts";

const trip = (
  overrides: Partial<PolicyTrip> = {},
): PolicyTrip => ({
  id: "trip-1",
  startDate: "2026-08-04",
  endDate: "2026-08-06",
  country: "GB",
  aggregateElection: false,
  days: [
    { date: "2026-08-04", eligible: true, confirmed: true },
    { date: "2026-08-05", eligible: true, confirmed: true },
    { date: "2026-08-06", eligible: true, confirmed: true },
  ],
  ...overrides,
});

const expense = (
  id: string,
  date: string,
  amountPence: number,
  overrides: Partial<PolicyExpense> = {},
): PolicyExpense => ({
  id,
  serviceDate: date,
  receiptTotalPence: amountPence,
  eligiblePence: amountPence,
  gratuityPence: 0,
  currency: "GBP",
  country: "GB",
  tripId: "trip-1",
  hasReceipt: true,
  category: "food",
  ...overrides,
});

describe("JSP 752 v66.1 calculation", () => {
  it("claims actual spend only and caps each non-aggregated day at £30", () => {
    const result = calculateJsp752(
      [trip()],
      [
        expense("a", "2026-08-04", 1_250),
        expense("b", "2026-08-05", 4_500),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 4_250);
    assert.deepEqual(
      result.lines.map((line) => line.claimablePence),
      [1_250, 3_000],
    );
  });

  it("allows a two-night trip to aggregate confirmed day allowances", () => {
    const result = calculateJsp752(
      [trip({ aggregateElection: true })],
      [
        expense("a", "2026-08-04", 5_000),
        expense("b", "2026-08-05", 1_000),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 6_000);
  });

  it("does not aggregate a trip shorter than two nights", () => {
    const shortTrip = trip({
      endDate: "2026-08-05",
      aggregateElection: true,
      days: [
        { date: "2026-08-04", eligible: true, confirmed: true },
        { date: "2026-08-05", eligible: true, confirmed: true },
      ],
    });
    const result = calculateJsp752(
      [shortTrip],
      [
        expense("a", "2026-08-04", 5_000),
        expense("b", "2026-08-05", 1_000),
      ],
    );
    assert.equal(result.claimablePence, 4_000);
  });

  it("claims travel and parking at actuals without touching the daily cap", () => {
    const result = calculateJsp752(
      [trip()],
      [
        expense("meal", "2026-08-04", 2_900),
        expense("cab", "2026-08-04", 4_200, { category: "taxi" }),
        expense("park", "2026-08-05", 1_150, { category: "parking" }),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 2_900 + 4_200 + 1_150);
    const byId = new Map(result.lines.map((line) => [line.expenseId, line]));
    assert.equal(byId.get("cab")?.claimablePence, 4_200);
    assert.equal(byId.get("cab")?.reason, null);
    assert.equal(byId.get("meal")?.claimablePence, 2_900);
  });

  it("keeps the food cap intact on a day that mixes food and travel", () => {
    const result = calculateJsp752(
      [],
      [
        expense("meal", "2026-08-04", 3_500, { tripId: null }),
        expense("tube", "2026-08-04", 850, {
          tripId: null,
          category: "public_transport",
        }),
      ],
    );
    assert.equal(result.allowancePence, 3_000);
    assert.equal(result.claimablePence, 3_000 + 850);
    const byId = new Map(result.lines.map((line) => [line.expenseId, line]));
    assert.equal(byId.get("meal")?.claimablePence, 3_000);
    assert.equal(byId.get("meal")?.reason, "Daily allowance reached");
    assert.equal(byId.get("tube")?.claimablePence, 850);
  });

  it("does not create a daily allowance for a travel-only day", () => {
    const result = calculateJsp752(
      [],
      [expense("cab", "2026-08-04", 2_000, { tripId: null, category: "taxi" })],
    );
    assert.equal(result.allowancePence, 0);
    assert.equal(result.claimablePence, 2_000);
  });

  it("includes an identified gratuity within the £30 daily limit", () => {
    const result = calculateJsp752(
      [trip()],
      [expense("a", "2026-08-04", 2_500, { gratuityPence: 500 })],
    );
    assert.equal(result.qualifyingActualPence, 2_500);
    assert.equal(result.claimablePence, 2_500);
    assert.equal(result.totalGratuityPence, 500);
  });

  it("caps food, drink and gratuity together at the daily limit", () => {
    const result = calculateJsp752(
      [trip()],
      [expense("a", "2026-08-04", 3_500, { gratuityPence: 500 })],
    );
    assert.equal(result.qualifyingActualPence, 3_500);
    assert.equal(result.claimablePence, 3_000);
  });

  it("allows standalone receipted expenses and shares their daily cap", () => {
    const result = calculateJsp752(
      [],
      [
        expense("a", "2026-08-04", 2_000, { tripId: null }),
        expense("b", "2026-08-04", 2_000, { tripId: null }),
      ],
    );
    assert.equal(result.allowancePence, 3_000);
    assert.equal(result.claimablePence, 3_000);
    assert.deepEqual(
      result.lines.map((line) => line.claimablePence),
      [2_000, 1_000],
    );
  });

  it("shares one daily cap across standalone and trip-linked expenses", () => {
    const result = calculateJsp752(
      [trip()],
      [
        expense("a", "2026-08-04", 2_000),
        expense("b", "2026-08-04", 2_000, { tripId: null }),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 3_000);
  });

  it("shares one daily cap across overlapping non-aggregated trips", () => {
    const secondTrip = trip({ id: "trip-2" });
    const result = calculateJsp752(
      [trip(), secondTrip],
      [
        expense("a", "2026-08-04", 2_000),
        expense("b", "2026-08-04", 2_000, { tripId: "trip-2" }),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 3_000);
  });

  it("does not add a standalone cap inside an aggregated trip period", () => {
    const result = calculateJsp752(
      [trip({ aggregateElection: true })],
      [
        expense("a", "2026-08-04", 9_000),
        expense("b", "2026-08-04", 3_000, { tripId: null }),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 9_000);
  });

  it("caps and flags overlapping aggregated trip periods", () => {
    const result = calculateJsp752(
      [
        trip({ aggregateElection: true }),
        trip({ id: "trip-2", aggregateElection: true }),
      ],
      [
        expense("a", "2026-08-04", 6_000),
        expense("b", "2026-08-04", 6_000, { tripId: "trip-2" }),
      ],
    );
    assert.equal(result.allowancePence, 9_000);
    assert.equal(result.claimablePence, 9_000);
    assert.equal(result.issues[0]?.code, "aggregate_period_overlap");
  });

  it("does not claim expenses lacking evidence or confirmed eligibility", () => {
    const result = calculateJsp752(
      [trip()],
      [
        expense("a", "2026-08-04", 1_000, { hasReceipt: false }),
        expense("b", "2026-08-07", 1_000),
      ],
    );
    assert.equal(result.claimablePence, 0);
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ["receipt_missing", "eligibility_unconfirmed"],
    );
  });

  it("ignores meal labels and rejects non-GB jurisdiction", () => {
    const result = calculateJsp752(
      [trip()],
      [expense("a", "2026-08-04", 1_000, { country: "FR" })],
    );
    assert.equal(result.claimablePence, 0);
    assert.equal(result.issues[0]?.code, "jurisdiction_invalid");
  });
});
