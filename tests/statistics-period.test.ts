import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { statisticsPeriod } from "../app/components/statistics-period.ts";

describe("statistics periods", () => {
  it("uses Monday to Sunday for a selected week", () => {
    const period = statisticsPeriod("week", "2026-08-12");

    assert.equal(period.startDate, "2026-08-10");
    assert.equal(period.endDate, "2026-08-16");
    assert.equal(period.previousStartDate, "2026-08-03");
    assert.equal(period.previousEndDate, "2026-08-09");
  });

  it("uses the complete selected calendar month", () => {
    const period = statisticsPeriod("month", "2028-02-14");

    assert.equal(period.startDate, "2028-02-01");
    assert.equal(period.endDate, "2028-02-29");
    assert.equal(period.previousStartDate, "2028-01-01");
    assert.equal(period.previousEndDate, "2028-01-31");
  });

  it("uses three calendar months ending in the selected month", () => {
    const period = statisticsPeriod("three_months", "2026-08-12");

    assert.equal(period.startDate, "2026-06-01");
    assert.equal(period.endDate, "2026-08-31");
    assert.equal(period.previousStartDate, "2026-03-01");
    assert.equal(period.previousEndDate, "2026-05-31");
  });

  it("uses the selected calendar year", () => {
    const period = statisticsPeriod("annual", "2026-08-12");

    assert.equal(period.startDate, "2026-01-01");
    assert.equal(period.endDate, "2026-12-31");
    assert.equal(period.previousStartDate, "2025-01-01");
    assert.equal(period.previousEndDate, "2025-12-31");
  });
});
