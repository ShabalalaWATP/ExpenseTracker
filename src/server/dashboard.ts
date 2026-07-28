import {
  calculateJsp752,
  JSP_752_POLICY,
  type PolicyExpense,
  type PolicyTrip,
} from "@/src/domain/jsp752";
import { listClaims } from "./claim-repository";
import { listExpenses } from "./expense-repository";
import { listTrips } from "./trip-repository";

export const CLAIM_PERIOD = "2026-08";

export async function dashboard() {
  const [expenses, trips, claims] = await Promise.all([
    listExpenses(),
    listTrips(),
    listClaims(),
  ]);
  const periodExpenses = expenses.filter((expense) =>
    expense.serviceDate.startsWith(`${CLAIM_PERIOD}-`),
  );
  const policyTrips: PolicyTrip[] = trips.map((trip) => ({
    id: trip.id,
    startDate: trip.startDate,
    endDate: trip.endDate,
    country: trip.country,
    aggregateElection: trip.aggregateElection,
    days: trip.days
      .filter((day) => day.date.startsWith(`${CLAIM_PERIOD}-`))
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
  }));
  const calculation = calculateJsp752(policyTrips, policyExpenses);
  const issues = [...calculation.issues];
  for (const trip of trips) {
    const crossesClaimPeriod =
      trip.aggregateElection &&
      (trip.startDate.slice(0, 7) !== CLAIM_PERIOD ||
        trip.endDate.slice(0, 7) !== CLAIM_PERIOD);
    const hasPeriodExpense = periodExpenses.some(
      (expense) => expense.tripId === trip.id,
    );
    if (crossesClaimPeriod && hasPeriodExpense) {
      issues.push({
        code: "aggregate_crosses_claim_period",
        message:
          "This aggregated trip crosses the August boundary and needs manual review.",
        tripId: trip.id,
      });
    }
  }
  if (periodExpenses.length === 0) {
    issues.push({
      code: "expenses_missing",
      message: "Add at least one August expense before preparing the claim.",
    });
  } else if (calculation.claimablePence === 0 && calculation.issues.length === 0) {
    issues.push({
      code: "claimable_spend_missing",
      message: "There is no claimable actual spend in August.",
    });
  }
  const todayDate = new Date().toISOString().slice(0, 10);
  const todayExpenses = periodExpenses.filter(
    (expense) => expense.serviceDate === todayDate,
  );
  const todayExpenseIds = new Set(todayExpenses.map((expense) => expense.id));
  const todayClaimablePence = calculation.lines
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
      period: CLAIM_PERIOD,
    },
    today: {
      date: todayDate,
      dailyCapPence: JSP_752_POLICY.dailyCapPence,
      spentPence: todayExpenses.reduce(
        (sum, expense) =>
          sum + Math.max(0, expense.eligiblePence - expense.gratuityPence),
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
    trips,
    claims,
    summary: {
      period: CLAIM_PERIOD,
      totalReceiptPence: calculation.totalSpendPence,
      totalExpensesPence: calculation.totalSpendPence,
      totalEligiblePence: periodExpenses.reduce(
        (sum, expense) => sum + expense.eligiblePence,
        0,
      ),
      totalGratuityPence: calculation.totalGratuityPence,
      qualifyingActualPence: calculation.qualifyingActualPence,
      allowancePence: calculation.allowancePence,
      claimablePence: calculation.claimablePence,
      excessPence: Math.max(
        0,
        calculation.qualifyingActualPence - calculation.claimablePence,
      ),
      expenseCount: periodExpenses.length,
      receiptCount: periodExpenses.filter((expense) => expense.receipt).length,
    },
    readiness: {
      ready: issues.length === 0,
      issues,
    },
    calculation,
  };
}
