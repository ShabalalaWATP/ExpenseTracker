import type {
  Claim,
  DashboardData,
  Expense,
  ExpenseDraft,
  ViewName,
} from "./types";
import { claimableAmountIndex } from "../../src/domain/calendar";
import { normaliseExpense, normaliseTrip } from "./expense-normalisation";
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
  const confirmedEligible = integer(
    totals.confirmedEligiblePence ??
      totals.totalEligiblePence ??
      totals.totalExpensesPence,
  );
  const policyEligible = integer(
    totals.policyEligiblePence ??
      totals.qualifyingActualPence ??
      totals.actualPence,
  );

  return {
    claimPeriod: text(totals.period ?? record(root.policy).period),
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
    pendingReceiptCount: integer(totals.pendingReceiptCount),
    pendingEstimatedEligiblePence: integer(
      totals.pendingEstimatedEligiblePence,
    ),
    undatedPendingCount: integer(totals.undatedPendingCount),
    confirmedEligiblePence: confirmedEligible,
    policyEligiblePence: policyEligible,
    overLimitPence: integer(
      totals.overLimitPence,
      Math.max(0, policyEligible - claimable),
    ),
    blockedConfirmedPence: integer(
      totals.blockedConfirmedPence,
      Math.max(0, confirmedEligible - policyEligible),
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

export async function getDashboard(period?: string): Promise<DashboardData> {
  const query = period ? `?period=${encodeURIComponent(period)}` : "";
  return normaliseDashboard(await apiRequest<unknown>(`/api/dashboard${query}`));
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
      country: draft.country,
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
  compatiblePreview?: Blob,
): Promise<void> {
  const receiptUrl = `/api/expenses/${encodeURIComponent(expenseId)}/receipt`;
  const response = await fetch(receiptUrl, {
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
  if (!compatiblePreview) return;
  const previewResponse = await fetch(`${receiptUrl}/preview`, {
    method: "PUT",
    headers: { "Content-Type": compatiblePreview.type || "image/jpeg" },
    body: compatiblePreview,
  });
  if (!previewResponse.ok) {
    throw new Error(
      `The original is stored, but its browser preview could not be prepared (${previewResponse.status}). Retry to finish.`,
    );
  }
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

export async function prepareClaim(period: string): Promise<Claim> {
  const result = await apiRequest<unknown>("/api/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period }),
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
