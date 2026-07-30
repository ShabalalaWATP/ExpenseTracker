import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { claimPeriodFigures } from "../src/domain/claim-period.ts";

describe("claim period figures", () => {
  it("separates confirmed, blocked and over-limit spend", () => {
    assert.deepEqual(
      claimPeriodFigures(
        [{ eligiblePence: 2_000 }, { eligiblePence: 2_500 }],
        [],
        { qualifyingActualPence: 4_000, claimablePence: 3_000 },
      ),
      {
        pendingReceiptCount: 0,
        pendingEstimatedEligiblePence: 0,
        confirmedEligiblePence: 4_500,
        policyEligiblePence: 4_000,
        claimablePence: 3_000,
        overLimitPence: 1_000,
        blockedConfirmedPence: 500,
      },
    );
  });

  it("shows pending estimates without making them claimable", () => {
    const figures = claimPeriodFigures(
      [],
      [{ eligiblePence: 1_250 }, { eligiblePence: null }],
      { qualifyingActualPence: 0, claimablePence: 0 },
    );
    assert.equal(figures.pendingReceiptCount, 2);
    assert.equal(figures.pendingEstimatedEligiblePence, 1_250);
    assert.equal(figures.confirmedEligiblePence, 0);
    assert.equal(figures.claimablePence, 0);
  });
});
