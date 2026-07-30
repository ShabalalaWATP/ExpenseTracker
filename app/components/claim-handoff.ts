import type { Expense } from "./types";

export function claimDescription(expense: Expense): string {
  return [expense.location.trim(), expense.reason.trim()]
    .filter(Boolean)
    .join(". ");
}

export function claimPeriodExpenses(
  expenses: readonly Expense[],
  period: string,
): Expense[] {
  return expenses
    .filter((expense) => expense.date.startsWith(`${period}-`))
    .sort((a, b) =>
      a.date === b.date
        ? a.merchant.localeCompare(b.merchant, "en-GB")
        : a.date.localeCompare(b.date),
    );
}

export function claimHandoffText(
  expenses: readonly Expense[],
  period: string,
): string {
  return claimPeriodExpenses(expenses, period)
    .map(
      (expense) =>
        `${expense.date} · ${expense.merchant}\n${claimDescription(expense)}`,
    )
    .join("\n\n");
}
