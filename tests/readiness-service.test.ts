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

test("ambiguous receipt trip matches open the intake with a specific title", () => {
  const issue = structuredReadinessIssue(
    {
      code: "receipt_trip_ambiguous",
      intakeId: "intake-1",
    },
    0,
  );
  assert.equal(issue.title, "Choose the matching trip");
  assert.deepEqual(issue.target, {
    view: "capture",
    intakeId: "intake-1",
  });
});
