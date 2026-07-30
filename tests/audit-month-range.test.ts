import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { auditMonthRange } from "../app/components/audit-range.ts";

test("audit month range handles leap years and year end deterministically", () => {
  assert.deepEqual(auditMonthRange("2028-02"), {
    startDate: "2028-02-01",
    endDate: "2028-02-29",
  });
  assert.deepEqual(auditMonthRange("2026-12"), {
    startDate: "2026-12-01",
    endDate: "2026-12-31",
  });
});
