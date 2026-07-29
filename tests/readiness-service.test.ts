import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { structuredReadinessIssue } from "../src/server/readiness-service.ts";

test("trip eligibility blockers open the trip on the affected date", () => {
  const issue = structuredReadinessIssue(
    {
      code: "eligibility_unconfirmed",
      expenseId: "expense-1",
      tripId: "trip-1",
      date: "2026-08-12",
    },
    0,
  );
  assert.deepEqual(issue.target, {
    view: "trips",
    tripId: "trip-1",
    date: "2026-08-12",
  });
});

test("receipt blockers still open the affected expense", () => {
  const issue = structuredReadinessIssue(
    {
      code: "receipt_missing",
      expenseId: "expense-1",
      tripId: "trip-1",
    },
    0,
  );
  assert.deepEqual(issue.target, {
    view: "expenses",
    expenseId: "expense-1",
  });
});
