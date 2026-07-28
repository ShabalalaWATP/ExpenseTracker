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

  it("excludes separately identified gratuity", () => {
    const result = calculateJsp752(
      [trip()],
      [expense("a", "2026-08-04", 2_500, { gratuityPence: 500 })],
    );
    assert.equal(result.qualifyingActualPence, 2_000);
    assert.equal(result.claimablePence, 2_000);
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
