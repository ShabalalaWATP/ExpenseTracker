// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { countsTowardDailyCap } from "../domain/expense-categories.ts";
import type { PolicyCalculation } from "../domain/jsp752.ts";

export type AuditExpense = {
  id: string;
  serviceDate: string;
  merchant: string;
  location: string | null;
  businessReason: string | null;
  receiptTotalPence: number;
  eligiblePence: number;
  gratuityPence: number;
  originalCurrency: string;
  originalCountry: string;
  originalLanguage: string;
  originalReceiptTotalMinor: number;
  originalEligibleMinor: number;
  originalGratuityMinor: number;
  originalMinorUnitDigits: number;
  translation: {
    merchantEnglish?: string;
    locationEnglish?: string;
    summaryEnglish?: string;
    merchant?: string;
    locationHint?: string;
    businessReason?: string;
    lineItemDescriptions?: string[];
  };
  conversion: {
    source?: string;
    provider?: string;
    observationDate?: string | null;
    rateDisplay?: string;
    providerReference?: string;
    rounding?: string;
    indicative?: boolean;
  };
  category: string;
  mealContext: string | null;
  tripId: string | null;
  tripLegId: string | null;
  hasReceipt: boolean;
  claimablePence: number;
  capLimited: boolean;
};

export type AuditQuestion = {
  id: string;
  source: "rule" | "ai";
  expenseId: string | null;
  topic: string;
  detail: string;
  question: string;
};

export type AuditObservation = {
  topic: string;
  detail: string;
};

export type AuditRange = { startDate: string; endDate: string };

export const MAX_AUDIT_RANGE_DAYS = 92;
export const MAX_AUDIT_QUESTIONS = 40;

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function realDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function auditRangeIssue(
  startDate: unknown,
  endDate: unknown,
): string | null {
  if (!realDate(startDate)) return "startDate must be a real date using YYYY-MM-DD.";
  if (!realDate(endDate)) return "endDate must be a real date using YYYY-MM-DD.";
  if (endDate < startDate) {
    return "The audit end date must not be before the start date.";
  }
  const days =
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000 +
    1;
  if (days > MAX_AUDIT_RANGE_DAYS) {
    return `Audit reports cover up to ${MAX_AUDIT_RANGE_DAYS} days at a time.`;
  }
  return null;
}

export function ruleFindings(
  expenses: readonly AuditExpense[],
  calculation: PolicyCalculation,
): { questions: AuditQuestion[]; observations: AuditObservation[] } {
  const questions: AuditQuestion[] = [];
  const observations: AuditObservation[] = [];
  for (const expense of expenses) {
    const label = `${expense.serviceDate} ${expense.merchant}`;
    if (!expense.hasReceipt) {
      questions.push({
        id: `rule-receipt-${expense.id}`,
        source: "rule",
        expenseId: expense.id,
        topic: "Missing receipt evidence",
        detail: `${label} (${money(expense.eligiblePence)}) has no stored receipt image.`,
        question:
          "Where is the original receipt, and why is it not attached to this expense?",
      });
    }
    if (!expense.location) {
      questions.push({
        id: `rule-location-${expense.id}`,
        source: "rule",
        expenseId: expense.id,
        topic: "Location not recorded",
        detail: `${label} has no location recorded.`,
        question: "Where was this expense incurred?",
      });
    }
    if (!expense.businessReason) {
      questions.push({
        id: `rule-reason-${expense.id}`,
        source: "rule",
        expenseId: expense.id,
        topic: "Duty reason not recorded",
        detail: `${label} has no duty reason recorded.`,
        question: "Why was this expense necessary for duty?",
      });
    }
    if (expense.capLimited) {
      questions.push({
        id: `rule-cap-${expense.id}`,
        source: "rule",
        expenseId: expense.id,
        topic: "Spend above the daily allowance",
        detail: `${label} took the day over the £30 subsistence allowance; only the capped amount is claimable.`,
        question:
          "What were the circumstances that led to spending above the daily allowance on this date?",
      });
    }
    if (expense.category === "other") {
      questions.push({
        id: `rule-category-${expense.id}`,
        source: "rule",
        expenseId: expense.id,
        topic: "Unclassified expense type",
        detail: `${label} is recorded with the category "Other".`,
        question:
          "What exactly was purchased, and under which entitlement is it claimed?",
      });
    }
  }
  const seen = new Set<string>();
  for (const expense of expenses) {
    const key = `${expense.serviceDate}|${expense.merchant.toLowerCase()}|${expense.receiptTotalPence}`;
    if (seen.has(key)) {
      questions.push({
        id: `rule-duplicate-${expense.id}`,
        source: "rule",
        expenseId: expense.id,
        topic: "Possible duplicate",
        detail: `${expense.serviceDate} ${expense.merchant} appears more than once for the same amount.`,
        question:
          "Are these separate purchases? Explain why the same merchant, date and amount appear more than once.",
      });
    } else {
      seen.add(key);
    }
  }
  for (const issue of calculation.issues) {
    observations.push({
      topic: `Readiness check: ${issue.code.replaceAll("_", " ")}`,
      detail: issue.message,
    });
  }
  const travelPence = expenses
    .filter((expense) => !countsTowardDailyCap(expense.category))
    .reduce((sum, expense) => sum + expense.eligiblePence, 0);
  if (travelPence > 0) {
    observations.push({
      topic: "Travel claimed at actuals",
      detail: `${money(travelPence)} of travel and parking is claimed at actual cost outside the daily subsistence allowance.`,
    });
  }
  return { questions, observations };
}
