import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { ukCalendarDate } from "../src/domain/calendar.ts";

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
