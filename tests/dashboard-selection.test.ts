import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { dataAfterPeriodSelection, isLatestDashboardRequest } from "../src/domain/dashboard-selection.ts";

describe("dashboard month selection", () => {
  it("clears stale totals before displaying a different claim month", () => {
    const august = { claimPeriod: "2026-08", claimablePence: 1_200 };
    assert.equal(
      dataAfterPeriodSelection(august, "2026-08", "2026-09"),
      null,
    );
    assert.equal(
      dataAfterPeriodSelection(august, "2026-08", "2026-08"),
      august,
    );
  });

  it("rejects an out-of-order dashboard response", () => {
    assert.equal(isLatestDashboardRequest(1, 2), false);
    assert.equal(isLatestDashboardRequest(2, 2), true);
  });
});
