import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { claimableAmountIndex, isIsoCalendarDate, ukCalendarDate } from "../src/domain/calendar.ts";

describe("UK calendar dates", () => {
  it("uses the next local day during British Summer Time", () => {
    assert.equal(
      ukCalendarDate(new Date("2026-07-31T23:30:00Z")),
      "2026-08-01",
    );
  });

  it("uses GMT during winter", () => {
    assert.equal(
      ukCalendarDate(new Date("2026-12-31T23:30:00Z")),
      "2026-12-31",
    );
  });
});

describe("calendar input helpers", () => {
  it("accepts only real ISO calendar dates", () => {
    assert.equal(isIsoCalendarDate("2026-08-14"), true);
    assert.equal(isIsoCalendarDate("2026-02-31"), false);
    assert.equal(isIsoCalendarDate("14/08/2026"), false);
  });

  it("indexes safe calculated amounts by expense", () => {
    const result = claimableAmountIndex([
      { expenseId: "expense-1", claimablePence: 1_200 },
      { expenseId: "expense-2", claimablePence: "900" },
      null,
    ]);
    assert.equal(result.get("expense-1"), 1_200);
    assert.equal(result.has("expense-2"), false);
  });
});
