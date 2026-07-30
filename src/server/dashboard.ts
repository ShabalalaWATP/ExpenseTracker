import {
  calculateJsp752,
  JSP_752_POLICY,
  type PolicyExpense,
  type PolicyTrip,
} from "@/src/domain/jsp752";
import { countsTowardDailyCap } from "@/src/domain/expense-categories";
import { claimPeriodFigures } from "@/src/domain/claim-period";
import {
  isIsoCalendarMonth,
  ukCalendarDate,
  ukCalendarMonth,
} from "@/src/domain/calendar";
import { listClaims } from "./claim-repository";
import {
  listDeletedExpenses,
  listExpenses,
} from "./expense-repository";
import { listTrips } from "./trip-repository";
import { listClaimBlockingReceiptIntakes } from "./receipt-intake-repository";
import type { Principal } from "./principal";
import { structuredReadinessIssue } from "./readiness-service";

function periodLabel(period: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}-01T00:00:00Z`));
}

function policyInputs(
  expenses: Awaited<ReturnType<typeof listExpenses>>,
  trips: Awaited<ReturnType<typeof listTrips>>,
  period: string,
) {
  const periodExpenses = expenses.filter((expense) =>
    expense.serviceDate.startsWith(`${period}-`),
  );
  const policyTrips: PolicyTrip[] = trips.map((trip) => ({
    id: trip.id,
    startDate: trip.startDate,
    endDate: trip.endDate,
    country: trip.country,
    aggregateElection: trip.aggregateElection,
    days: trip.days
      .filter((day) => day.date.startsWith(`${period}-`))
      .map((day) => ({
        date: day.date,
        eligible: day.eligible,
        confirmed: day.confirmed,
      })),
  }));
  const policyExpenses: PolicyExpense[] = periodExpenses.map((expense) => ({
    id: expense.id,
    serviceDate: expense.serviceDate,
    receiptTotalPence: expense.receiptTotalPence,
    eligiblePence: expense.eligiblePence,
    gratuityPence: expense.gratuityPence,
    currency: expense.currency,
    country: expense.country,
    tripId: expense.tripId,
    hasReceipt: Boolean(expense.receipt),
    category: expense.category,
  }));
  return {
    periodExpenses,
    calculation: calculateJsp752(policyTrips, policyExpenses),
  };
}

export async function dashboard(
  principal: Principal,
  requestedPeriod = ukCalendarMonth(),
) {
  const claimPeriod = isIsoCalendarMonth(requestedPeriod)
    ? requestedPeriod
    : ukCalendarMonth();
  const claimPeriodLabel = periodLabel(claimPeriod);
  const [expenses, deletedExpenses, trips, claims, receiptIntakes] =
    await Promise.all([
    listExpenses(principal),
    listDeletedExpenses(principal),
    listTrips(principal),
    listClaims(principal),
    listClaimBlockingReceiptIntakes(principal, claimPeriod),
  ]);
  const { periodExpenses, calculation } = policyInputs(
    expenses,
    trips,
    claimPeriod,
  );
  const pendingPeriodReceipts = receiptIntakes.filter(
    (intake) => intake.serviceDate?.slice(0, 7) === claimPeriod,
  );
  const undatedPendingCount = receiptIntakes.filter(
    (intake) => !intake.serviceDate,
  ).length;
  const periodFigures = claimPeriodFigures(
    periodExpenses,
    pendingPeriodReceipts,
    calculation,
  );
  const issues = [...calculation.issues];
  for (const intake of receiptIntakes) {
    issues.push({
      code:
        intake.tripMatchStatus === "ambiguous"
          ? "receipt_trip_ambiguous"
          : "receipt_intake_pending",
      message:
        intake.tripMatchStatus === "ambiguous"
          ? `${intake.merchant || intake.originalName} matches more than one confirmed eligible trip. Select the correct trip before confirming the expense.`
          : intake.serviceDate
            ? `Finish reviewing ${intake.merchant || intake.originalName} before preparing ${claimPeriodLabel}.`
            : `Finish reviewing ${intake.originalName}; its claim date is not confirmed.`,
      intakeId: intake.id,
    });
  }
  for (const trip of trips) {
    const crossesClaimPeriod =
      trip.aggregateElection &&
      (trip.startDate.slice(0, 7) !== claimPeriod ||
        trip.endDate.slice(0, 7) !== claimPeriod);
    const hasPeriodExpense = periodExpenses.some(
      (expense) => expense.tripId === trip.id,
    );
    if (crossesClaimPeriod && hasPeriodExpense) {
      issues.push({
        code: "aggregate_crosses_claim_period",
        message: `This aggregated trip crosses the ${claimPeriodLabel} boundary and needs manual review.`,
        tripId: trip.id,
      });
    }
  }
  if (periodExpenses.length === 0) {
    issues.push({
      code: "expenses_missing",
      message: `Add at least one confirmed ${claimPeriodLabel} expense before preparing the claim.`,
    });
  } else if (calculation.claimablePence === 0 && calculation.issues.length === 0) {
    issues.push({
      code: "claimable_spend_missing",
      message: `There is no claimable confirmed spend in ${claimPeriodLabel}.`,
    });
  }
  const todayDate = ukCalendarDate();
  const todayPeriod = todayDate.slice(0, 7);
  const todayCalculation =
    todayPeriod === claimPeriod
      ? calculation
      : policyInputs(expenses, trips, todayPeriod).calculation;
  // The today block reports the daily subsistence allowance, so only
  // food-category spend belongs in it; travel is claimed at actuals.
  const todayExpenses = expenses.filter(
    (expense) =>
      expense.serviceDate === todayDate &&
      countsTowardDailyCap(expense.category),
  );
  const todayExpenseIds = new Set(todayExpenses.map((expense) => expense.id));
  const todayClaimablePence = todayCalculation.lines
    .filter((line) => todayExpenseIds.has(line.expenseId))
    .reduce((sum, line) => sum + line.claimablePence, 0);
  const lockedPeriods = new Set(claims.map((claim) => claim.period));
  const submittedPeriods = new Set(
    claims
      .filter((claim) => claim.status === "submitted")
      .map((claim) => claim.period),
  );
  return {
    policy: {
      ...JSP_752_POLICY,
      period: claimPeriod,
    },
    today: {
      date: todayDate,
      dailyCapPence: JSP_752_POLICY.dailyCapPence,
      spentPence: todayExpenses.reduce(
        (sum, expense) => sum + Math.max(0, expense.eligiblePence),
        0,
      ),
      claimablePence: todayClaimablePence,
      remainingPence: Math.max(
        0,
        JSP_752_POLICY.dailyCapPence - todayClaimablePence,
      ),
    },
    expenses: expenses.map((expense) => ({
      ...expense,
      locked: lockedPeriods.has(expense.serviceDate.slice(0, 7)),
      submitted: submittedPeriods.has(expense.serviceDate.slice(0, 7)),
    })),
    deletedExpenses: deletedExpenses.map((expense) => ({
      ...expense,
      locked: lockedPeriods.has(expense.serviceDate.slice(0, 7)),
      submitted: submittedPeriods.has(expense.serviceDate.slice(0, 7)),
    })),
    trips,
    claims,
    summary: {
      period: claimPeriod,
      totalReceiptPence: calculation.totalSpendPence,
      totalExpensesPence: calculation.totalSpendPence,
      totalEligiblePence: periodExpenses.reduce(
        (sum, expense) => sum + expense.eligiblePence,
        0,
      ),
      totalGratuityPence: calculation.totalGratuityPence,
      qualifyingActualPence: calculation.qualifyingActualPence,
      allowancePence: calculation.allowancePence,
      excessPence: Math.max(
        0,
        calculation.qualifyingActualPence - calculation.claimablePence,
      ),
      expenseCount: periodExpenses.length,
      receiptCount: periodExpenses.filter((expense) => expense.receipt).length,
      undatedPendingCount,
      ...periodFigures,
    },
    readiness: {
      ready: issues.length === 0,
      issues: issues.map(structuredReadinessIssue),
    },
    calculation,
  };
}
