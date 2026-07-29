export const JSP_752_POLICY = Object.freeze({
  version: "JSP-752-v66.1",
  dailyCapPence: 3_000,
  currency: "GBP" as const,
  country: "GB" as const,
});

export type PolicyDay = {
  date: string;
  eligible: boolean;
  confirmed: boolean;
};

export type PolicyTrip = {
  id: string;
  startDate: string;
  endDate: string;
  country: string;
  aggregateElection: boolean;
  days: PolicyDay[];
};

export type PolicyExpense = {
  id: string;
  serviceDate: string;
  receiptTotalPence: number;
  eligiblePence: number;
  gratuityPence: number;
  currency: string;
  country: string;
  tripId: string | null;
  hasReceipt: boolean;
};

export type ReadinessIssue = {
  code: string;
  message: string;
  expenseId?: string;
  intakeId?: string;
  tripId?: string;
  date?: string;
};

export type CalculationLine = {
  expenseId: string;
  actualPence: number;
  claimablePence: number;
  reason: string | null;
};

export type PolicyCalculation = {
  totalSpendPence: number;
  totalGratuityPence: number;
  qualifyingActualPence: number;
  allowancePence: number;
  claimablePence: number;
  lines: CalculationLine[];
  issues: ReadinessIssue[];
};

function nights(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
}

function allocate(
  expenses: PolicyExpense[],
  allowancePence: number,
  lines: Map<string, CalculationLine>,
): number {
  let remaining = allowancePence;
  for (const expense of [...expenses].sort((a, b) =>
    a.serviceDate === b.serviceDate
      ? a.id.localeCompare(b.id)
      : a.serviceDate.localeCompare(b.serviceDate),
  )) {
    const actual = Math.max(0, expense.eligiblePence);
    const claimable = Math.min(actual, remaining);
    remaining -= claimable;
    lines.set(expense.id, {
      expenseId: expense.id,
      actualPence: actual,
      claimablePence: claimable,
      reason: claimable < actual ? "Daily allowance reached" : null,
    });
  }
  return allowancePence - remaining;
}

function issueFor(
  expense: PolicyExpense,
  trips: Map<string, PolicyTrip>,
): ReadinessIssue | null {
  if (!expense.hasReceipt) {
    return {
      code: "receipt_missing",
      message: "Attach a receipt before preparing the claim.",
      expenseId: expense.id,
    };
  }
  if (!expense.tripId) {
    return null;
  }
  if (!trips.has(expense.tripId)) {
    return {
      code: "trip_missing",
      message: "The linked trip no longer exists.",
      expenseId: expense.id,
    };
  }
  const trip = trips.get(expense.tripId)!;
  if (
    trip.country !== JSP_752_POLICY.country ||
    trip.country !== expense.country
  ) {
    return {
      code: "trip_country_invalid",
      message: "Aggregation is allowed only within one UK country context.",
      expenseId: expense.id,
      tripId: trip.id,
    };
  }
  const day = trip.days.find((candidate) => candidate.date === expense.serviceDate);
  if (!day?.eligible || !day.confirmed) {
    return {
      code: "eligibility_unconfirmed",
      message: "Confirm this date as eligible before preparing the claim.",
      expenseId: expense.id,
      tripId: trip.id,
      date: expense.serviceDate,
    };
  }
  return null;
}

function mergedDateGroups(groups: Set<string>[]): Set<string>[] {
  const merged: Set<string>[] = [];
  for (const group of groups) {
    const combined = new Set(group);
    for (let index = merged.length - 1; index >= 0; index -= 1) {
      if ([...merged[index]].some((date) => combined.has(date))) {
        for (const date of merged[index]) combined.add(date);
        merged.splice(index, 1);
      }
    }
    merged.push(combined);
  }
  return merged;
}

export function calculateJsp752(
  tripsInput: readonly PolicyTrip[],
  expensesInput: readonly PolicyExpense[],
): PolicyCalculation {
  const trips = new Map(tripsInput.map((trip) => [trip.id, trip]));
  const lines = new Map<string, CalculationLine>();
  const issues: ReadinessIssue[] = [];
  const qualifying: PolicyExpense[] = [];

  for (const expense of expensesInput) {
    const invalidJurisdiction =
      expense.currency !== JSP_752_POLICY.currency ||
      expense.country !== JSP_752_POLICY.country;
    const issue = invalidJurisdiction
      ? {
          code: "jurisdiction_invalid",
          message: "Only UK expenses paid in GBP are supported.",
          expenseId: expense.id,
        }
      : issueFor(expense, trips);
    if (issue) {
      issues.push(issue);
      lines.set(expense.id, {
        expenseId: expense.id,
        actualPence: Math.max(0, expense.eligiblePence),
        claimablePence: 0,
        reason: issue.message,
      });
    } else {
      qualifying.push(expense);
    }
  }

  let allowancePence = 0;
  let claimablePence = 0;
  const aggregateTrips = tripsInput.filter(
    (trip) =>
      trip.aggregateElection &&
      nights(trip.startDate, trip.endDate) >= 2,
  );
  const aggregateTripIds = new Set(aggregateTrips.map((trip) => trip.id));
  const aggregateGroups = mergedDateGroups(
    aggregateTrips.map(
      (trip) =>
        new Set(
          trip.days
            .filter((day) => day.eligible && day.confirmed)
            .map((day) => day.date),
        ),
    ),
  );
  const aggregateDates = new Set(
    aggregateGroups.flatMap((group) => [...group]),
  );
  for (const group of aggregateGroups) {
    const groupExpenses = qualifying.filter((expense) =>
      group.has(expense.serviceDate),
    );
    const groupAllowance = group.size * JSP_752_POLICY.dailyCapPence;
    allowancePence += groupAllowance;
    claimablePence += allocate(groupExpenses, groupAllowance, lines);
  }
  for (const trip of aggregateTrips) {
    const overlappingTrip = aggregateTrips.find(
      (candidate) =>
        candidate.id !== trip.id &&
        candidate.days.some(
          (day) =>
            day.eligible &&
            day.confirmed &&
            trip.days.some(
              (tripDay) =>
                tripDay.date === day.date &&
                tripDay.eligible &&
                tripDay.confirmed,
            ),
        ),
    );
    if (overlappingTrip && trip.id < overlappingTrip.id) {
      issues.push({
        code: "aggregate_period_overlap",
        message: "Overlapping aggregated trips require manual review.",
        tripId: trip.id,
      });
    }
  }
  const dailyExpenses = qualifying.filter(
    (expense) => !aggregateDates.has(expense.serviceDate),
  );
  const dailyDates = new Set(
    [
      ...dailyExpenses
        .filter((expense) => !expense.tripId)
        .map((expense) => expense.serviceDate),
      ...tripsInput
        .filter((trip) => !aggregateTripIds.has(trip.id))
        .flatMap((trip) =>
          trip.days
            .filter((day) => day.eligible && day.confirmed)
            .map((day) => day.date),
        ),
    ].filter((date) => !aggregateDates.has(date)),
  );
  for (const date of [...dailyDates].sort()) {
    allowancePence += JSP_752_POLICY.dailyCapPence;
    claimablePence += allocate(
      dailyExpenses.filter((expense) => expense.serviceDate === date),
      JSP_752_POLICY.dailyCapPence,
      lines,
    );
  }

  return {
    totalSpendPence: expensesInput.reduce(
      (sum, expense) => sum + expense.receiptTotalPence,
      0,
    ),
    totalGratuityPence: expensesInput.reduce(
      (sum, expense) => sum + expense.gratuityPence,
      0,
    ),
    qualifyingActualPence: qualifying.reduce(
      (sum, expense) => sum + Math.max(0, expense.eligiblePence),
      0,
    ),
    allowancePence,
    claimablePence,
    lines: expensesInput.map((expense) => lines.get(expense.id)!),
    issues,
  };
}
