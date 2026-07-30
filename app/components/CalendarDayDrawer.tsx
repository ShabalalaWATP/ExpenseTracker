"use client";

import { formatDate, formatMoney } from "./format";
import { categoryLabel, type Expense } from "./types";
import { EmptyState } from "./ui";

function amount(expense: Expense): number {
  return expense.claimableAmountPence ?? expense.eligibleAmountPence;
}

export function CalendarDayDrawer({
  date,
  expenses,
  allExpenseCount,
  locked,
  supported,
  supportedPeriod,
  onAdd,
  onClearFilter,
  onOpen,
}: {
  date: string;
  expenses: readonly Expense[];
  allExpenseCount: number;
  locked: boolean;
  supported: boolean;
  supportedPeriod?: string;
  onAdd: () => void;
  onClearFilter: () => void;
  onOpen: (expense: Expense) => void;
}) {
  const total = expenses.reduce((sum, expense) => sum + amount(expense), 0);
  return (
    <section className="calendar-inspector calendar-day-drawer" aria-labelledby="selected-day-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selected day</p>
          <h2 id="selected-day-heading">{formatDate(date)}</h2>
        </div>
        <div className="calendar-selected-total">
          <strong>{formatMoney(total)}</strong>
          <small>
            {expenses.length} {expenses.length === 1 ? "claim" : "claims"}
            {locked ? " · period locked" : ""}
            {!supported ? ` · ${supportedPeriod ?? "this period"} only` : ""}
          </small>
        </div>
      </div>
      {expenses.length ? (
        <ul className="calendar-claim-list">
          {expenses.map((expense) => {
            const receiptHref = expense.receiptUrl ??
              `/api/expenses/${encodeURIComponent(expense.id)}/receipt`;
            return (
              <li key={expense.id}>
                {expense.receiptStatus === "stored" ? (
                  <a className="calendar-receipt" href={receiptHref} target="_blank" rel="noreferrer" aria-label={`Open receipt from ${expense.merchant}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={receiptHref} alt="" loading="lazy" />
                  </a>
                ) : <span className="calendar-receipt missing">No receipt</span>}
                <button className="calendar-claim-main" type="button" onClick={() => onOpen(expense)}>
                  <strong>{expense.merchant || "Unnamed claim"}</strong>
                  <span>{expense.location || "Location needed"} · {expense.category === "food" || !expense.category ? (expense.mealContext || "Meal not set") : categoryLabel(expense.category)}</span>
                  <small>{expense.reason || "Reason needed"}</small>
                </button>
                <span className="money-stack">
                  <strong>{formatMoney(amount(expense))}</strong>
                  <small>{expense.claimableAmountPence === undefined ? "Eligible" : "Claimable"}</small>
                </span>
                <button className="round-button" type="button" onClick={() => onOpen(expense)} aria-label={`Open claim from ${expense.merchant}`}>→</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={
            allExpenseCount
              ? "No claims match this filter"
              : "No claims on this day"
          }
          action={
            allExpenseCount ? (
              <button className="secondary-button" type="button" onClick={onClearFilter}>Show all claims</button>
            ) : (
              <button className="primary-button" type="button" disabled={!supported || locked} onClick={onAdd}>
                {locked ? "Prepared period is locked" : supported ? "Add receipt for this date" : `Only ${supportedPeriod ?? "the selected month"} can be claimed`}
              </button>
            )
          }
        >
          {allExpenseCount
            ? "Change the evidence filter to view the existing records."
            : "Capture a receipt now, or choose another day."}
        </EmptyState>
      )}
    </section>
  );
}
