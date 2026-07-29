type RawIssue = {
  code?: string;
  message?: string;
  intakeId?: string;
  expenseId?: string;
  tripId?: string;
  date?: string;
};

export function structuredReadinessIssue(
  issue: RawIssue,
  index: number,
) {
  const code = issue.code || "review_required";
  const tripIssue = new Set([
    "trip_country_invalid",
    "eligibility_unconfirmed",
    "aggregate_period_overlap",
    "aggregate_crosses_claim_period",
  ]).has(code);
  const category =
    code.includes("receipt") || issue.intakeId
      ? "evidence"
      : code.includes("trip") || issue.tripId
        ? "trip"
        : code.includes("jurisdiction") || code.includes("aggregate")
          ? "policy"
          : "details";
  const target = issue.intakeId
    ? { view: "capture", intakeId: issue.intakeId }
    : issue.tripId && tripIssue
        ? { view: "trips", tripId: issue.tripId, date: issue.date }
        : issue.expenseId
          ? { view: "expenses", expenseId: issue.expenseId }
          : issue.tripId
            ? { view: "trips", tripId: issue.tripId, date: issue.date }
            : code === "expenses_missing"
              ? { view: "capture" }
              : { view: "expenses" };
  const title = {
    receipt_intake_pending: "Finish receipt review",
    receipt_missing: "Add receipt evidence",
    expenses_missing: "Add an August receipt",
    claimable_spend_missing: "Review eligible spend",
    aggregate_crosses_claim_period: "Review trip dates",
  }[code] ?? "Resolve claim detail";
  const entity = issue.intakeId || issue.expenseId || issue.tripId || issue.date;
  return {
    id: `${code}:${entity || index}`,
    code,
    category,
    severity: "blocking" as const,
    title,
    detail: issue.message || "This item needs attention before preparation.",
    target,
  };
}
