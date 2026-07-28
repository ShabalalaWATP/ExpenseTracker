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
    const actual = Math.max(0, expense.eligiblePence - expense.gratuityPence);
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
        actualPence: Math.max(0, expense.eligiblePence - expense.gratuityPence),
        claimablePence: 0,
        reason: issue.message,
      });
    } else {
      qualifying.push(expense);
    }
  }

  let allowancePence = 0;
  let claimablePence = 0;
  const standalone = qualifying.filter((expense) => !expense.tripId);
  const standaloneDates = new Set(
    standalone.map((expense) => expense.serviceDate),
  );
  for (const date of [...standaloneDates].sort()) {
    allowancePence += JSP_752_POLICY.dailyCapPence;
    claimablePence += allocate(
      standalone.filter((expense) => expense.serviceDate === date),
      JSP_752_POLICY.dailyCapPence,
      lines,
    );
  }
  for (const trip of tripsInput) {
    const tripExpenses = qualifying.filter((expense) => expense.tripId === trip.id);
    const eligibleDates = new Set(
      trip.days
        .filter((day) => day.eligible && day.confirmed)
        .map((day) => day.date),
    );
    if (trip.aggregateElection && nights(trip.startDate, trip.endDate) >= 2) {
      const tripAllowance = eligibleDates.size * JSP_752_POLICY.dailyCapPence;
      allowancePence += tripAllowance;
      claimablePence += allocate(tripExpenses, tripAllowance, lines);
      continue;
    }
    for (const date of [...eligibleDates].sort()) {
      allowancePence += JSP_752_POLICY.dailyCapPence;
      const dailyExpenses = tripExpenses.filter(
        (expense) => expense.serviceDate === date,
      );
      if (dailyExpenses.length === 0) continue;
      claimablePence += allocate(
        dailyExpenses,
        JSP_752_POLICY.dailyCapPence,
        lines,
      );
    }
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
      (sum, expense) =>
        sum + Math.max(0, expense.eligiblePence - expense.gratuityPence),
      0,
    ),
    allowancePence,
    claimablePence,
    lines: expensesInput.map((expense) => lines.get(expense.id)!),
    issues,
  };
}
