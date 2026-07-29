import type { Expense } from "./types";

export function claimDescription(expense: Expense): string {
  return [expense.location.trim(), expense.reason.trim()]
    .filter(Boolean)
    .join(". ");
}

export function augustClaimExpenses(expenses: readonly Expense[]): Expense[] {
  return expenses
    .filter((expense) => expense.date.startsWith("2026-08"))
    .sort((a, b) =>
      a.date === b.date
        ? a.merchant.localeCompare(b.merchant, "en-GB")
        : a.date.localeCompare(b.date),
    );
}

export function claimHandoffText(expenses: readonly Expense[]): string {
  return augustClaimExpenses(expenses)
    .map(
      (expense) =>
        `${expense.date} · ${expense.merchant}\n${claimDescription(expense)}`,
    )
    .join("\n\n");
}
