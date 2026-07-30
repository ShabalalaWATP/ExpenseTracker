import type {
  Claim,
  DashboardData,
  Expense,
  ExpenseDraft,
  Trip,
  ViewName,
} from "./types";
import { claimableAmountIndex } from "../../src/domain/calendar";
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? (value as RecordValue) : {};
}
function integer(value: unknown, fallback = 0): number {
  return Number.isSafeInteger(value) ? (value as number) : fallback;
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function normaliseExpense(value: unknown): Expense {
  const item = record(value);
  const receipt = record(item.receipt);
  const claimable = item.claimableAmountPence ?? item.claimablePence;
  return {
    id: text(item.id),
    date: text(item.date ?? item.serviceDate ?? item.expenseDate),
    merchant: text(item.merchant, "Merchant not entered"),
    receiptTotalPence: integer(
      item.receiptTotalPence ?? item.totalPence,
      integer(item.amountPence),
    ),
    eligibleAmountPence: integer(
      item.eligibleAmountPence ?? item.eligiblePence ?? item.amountPence,
    ),
    gratuityPence: integer(item.gratuityPence),
    claimableAmountPence: Number.isSafeInteger(claimable)
      ? (claimable as number)
      : undefined,
    country: text(item.country, "GB"),
    location: text(item.location),
    reason: text(item.reason ?? item.businessReason),
    mealContext: text(item.mealContext) as Expense["mealContext"],
    category: (text(item.category) || "food") as Expense["category"],
    tripId: text(item.tripId) || undefined,
    receiptStatus:
      text(item.receiptStatus ?? item.evidenceStatus) ||
      (item.receipt ? "stored" : "missing"),
    receiptUrl: text(item.receiptUrl ?? receipt.url) || undefined,
    readiness: text(item.readiness ?? item.readinessStatus),
    submitted: Boolean(item.submitted ?? item.isSubmitted),
    locked: Boolean(item.locked ?? item.isLocked),
    deletedAt: text(item.deletedAt) || null,
  };
}

function normaliseTrip(value: unknown): Trip {
  const item = record(value);
  const days = Array.isArray(item.days) ? item.days : [];
  return {
    id: text(item.id),
    title: text(item.title ?? item.name, "Untitled trip"),
    location: text(item.location ?? item.purpose),
    country: text(item.country, "GB"),
    startDate: text(item.startDate),
    endDate: text(item.endDate),
    eligibleDates: Array.isArray(item.eligibleDates)
      ? item.eligibleDates.filter((date): date is string => typeof date === "string")
      : days
          .map(record)
          .filter((day) => Boolean(day.eligible))
          .map((day) => text(day.date))
          .filter(Boolean),
    calculationMethod: Boolean(item.aggregateElection)
      ? "aggregate"
      : (text(item.calculationMethod ?? item.method) as "daily" | "aggregate") ||
        "daily",
    attested:
      Boolean(item.attested ?? item.eligibilityAttested) ||
      (days.map(record).some((day) => Boolean(day.eligible)) &&
        days
          .map(record)
          .filter((day) => Boolean(day.eligible))
          .every((day) => Boolean(day.confirmed))),
  };
}

function normaliseClaim(value: unknown): Claim {
  const item = record(value);
  const actual = integer(
    item.actualPence ??
      item.eligibleActualPence ??
      item.qualifyingActualPence ??
      item.totalSpendPence,
  );
  const claimable = integer(item.claimablePence);
  return {
    id: text(item.id),
    period: text(item.period ?? item.claimPeriod),
    status: text(item.status),
    actualPence: actual,
    claimablePence: claimable,
    excessPence: integer(item.excessPence, Math.max(0, actual - claimable)),
    preparedAt: text(item.preparedAt) || undefined,
  };
}

export function normaliseDashboard(value: unknown): DashboardData {
  const envelope = record(value);
  const root = record(envelope.data ?? value);
  const totals = record(root.totals ?? root.augustTotals ?? root.summary);
  const today = record(root.today);
  const readiness = record(root.readiness);
  const attentionSource =
    root.attention ?? root.attentionItems ?? readiness.issues;
  const expenses = Array.isArray(root.expenses) ? root.expenses : [];
  const deletedExpenses = Array.isArray(root.deletedExpenses)
    ? root.deletedExpenses
    : [];
  const trips = Array.isArray(root.trips) ? root.trips : [];
  const claims = Array.isArray(root.claims) ? root.claims : [];
  const calculation = record(root.calculation);
  const claimableByExpense = claimableAmountIndex(calculation.lines);
  const cap = integer(today.dailyCapPence ?? root.dailyCapPence, 3000);
  const todayDate = text(today.date ?? root.date) || new Date().toISOString().slice(0, 10);
  const spent = integer(
    today.spentPence ?? today.actualPence,
  );
  const claimableToday = integer(today.claimablePence);
  const actual = integer(
    totals.actualPence ??
      totals.qualifyingActualPence ??
      totals.totalEligiblePence ??
      totals.totalExpensesPence ??
      root.actualPence,
  );
  const claimable = integer(totals.claimablePence ?? root.claimablePence);

  return {
    date: todayDate,
    dailyCapPence: cap,
    spentTodayPence: spent,
    claimableTodayPence: claimableToday,
    remainingTodayPence: integer(
      today.remainingPence,
      Math.max(0, cap - claimableToday),
    ),
    actualPence: actual,
    claimablePence: claimable,
    excessPence: integer(
      totals.excessPence ?? root.excessPence,
      Math.max(0, actual - claimable),
    ),
    claimReady: Boolean(readiness.ready),
    attention: Array.isArray(attentionSource)
      ? attentionSource.map((value) => {
          const item = record(value);
          const rawTarget = record(item.target);
          const fallbackId =
            text(item.expenseId ?? item.intakeId ?? item.tripId ?? item.id) ||
            "readiness";
          const targetView = text(rawTarget.view);
          const view: ViewName =
            targetView === "capture" ||
            targetView === "trips" ||
            targetView === "calendar" ||
            targetView === "claims" ||
            targetView === "settings" ||
            targetView === "today"
              ? targetView
              : "expenses";
          const target = {
            view,
            intakeId: text(rawTarget.intakeId) || undefined,
            expenseId: text(rawTarget.expenseId) || undefined,
            tripId: text(rawTarget.tripId) || undefined,
            date: text(rawTarget.date) || undefined,
            startDate: text(rawTarget.startDate) || undefined,
            endDate: text(rawTarget.endDate) || undefined,
          };
          return {
            id: text(item.id) || fallbackId,
            code: text(item.code) || undefined,
            category:
              item.category === "evidence" ||
              item.category === "trip" ||
              item.category === "policy"
                ? item.category
                : "details",
            severity: item.severity === "warning" ? "warning" : "blocking",
            title: text(item.title ?? item.message ?? item.code, "Needs attention"),
            detail: text(item.detail ?? item.description) || undefined,
            view: target.view,
            target,
          };
        })
      : [],
    expenses: expenses.map(normaliseExpense).map((expense) => ({
      ...expense,
      claimableAmountPence:
        claimableByExpense.get(expense.id) ?? expense.claimableAmountPence,
    })),
    deletedExpenses: deletedExpenses.map(normaliseExpense),
    trips: trips.map(normaliseTrip),
    claims: claims.map(normaliseClaim),
  };
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = record(body);
    const nestedError = record(detail.error);
    throw new Error(
      text(
        nestedError.message ?? detail.error ?? detail.message,
        `Request failed (${response.status})`,
      ),
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getDashboard(): Promise<DashboardData> {
  return normaliseDashboard(await apiRequest<unknown>("/api/dashboard"));
}

export async function createExpense(draft: ExpenseDraft): Promise<Expense> {
  const result = await apiRequest<unknown>("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serviceDate: draft.date,
      merchant: draft.merchant,
      location: draft.location,
      businessReason: draft.reason,
      receiptTotalPence: draft.receiptTotalPence,
      eligiblePence: draft.eligibleAmountPence,
      gratuityPence: draft.gratuityPence ?? 0,
      currency: "GBP",
      country: "GB",
      tripId: draft.tripId || null,
      mealContext: draft.mealContext || null,
      category: draft.category || "food",
    }),
  });
  const root = record(result);
  const data = record(root.data);
  return normaliseExpense(data.expense ?? root.expense ?? data ?? root);
}

export async function uploadReceipt(
  expenseId: string,
  file: File,
  idempotencyKey: string,
): Promise<void> {
  const response = await fetch(`/api/expenses/${encodeURIComponent(expenseId)}/receipt`, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
      "x-idempotency-key": idempotencyKey,
      "Idempotency-Key": idempotencyKey,
    },
    body: file,
  });
  if (!response.ok) throw new Error(`Receipt upload failed (${response.status})`);
}

export async function updateExpense(
  id: string,
  changes: Partial<ExpenseDraft>,
): Promise<void> {
  const patch: RecordValue = {};
  if (changes.date !== undefined) patch.serviceDate = changes.date;
  if (changes.merchant !== undefined) patch.merchant = changes.merchant;
  if (changes.eligibleAmountPence !== undefined) {
    patch.eligiblePence = changes.eligibleAmountPence;
  }
  if (changes.receiptTotalPence !== undefined) {
    patch.receiptTotalPence = changes.receiptTotalPence;
  }
  if (changes.gratuityPence !== undefined) {
    patch.gratuityPence = changes.gratuityPence;
  }
  if (changes.location !== undefined) patch.location = changes.location;
  if (changes.reason !== undefined) patch.businessReason = changes.reason;
  if (changes.tripId !== undefined) patch.tripId = changes.tripId || null;
  if (changes.mealContext !== undefined) {
    patch.mealContext = changes.mealContext || null;
  }
  if (changes.category !== undefined) patch.category = changes.category;
  await apiRequest(`/api/expenses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await apiRequest(`/api/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function restoreExpense(id: string): Promise<void> {
  await apiRequest(`/api/expenses/${encodeURIComponent(id)}/restore`, {
    method: "POST",
  });
}

export async function prepareClaim(): Promise<Claim> {
  const result = await apiRequest<unknown>("/api/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period: "2026-08" }),
  });
  const root = record(result);
  const data = record(root.data);
  return normaliseClaim(data.claim ?? root.claim ?? data ?? root);
}

export async function submitClaim(id: string): Promise<void> {
  await apiRequest(`/api/claims/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "submitted" }),
  });
}
