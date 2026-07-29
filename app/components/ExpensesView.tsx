"use client";

import { useMemo, useState } from "react";
import { restoreExpense } from "./api";
import { ExpenseEditor } from "./ExpenseEditor";
import { formatDate, formatMoney } from "./format";
import { ReceiptAttachment } from "./ReceiptAttachment";
import type { DashboardData, Expense, ViewName } from "./types";
import { EmptyState, StatusMessage, ViewHeader } from "./ui";

type Filter = "all" | "august" | "needs-receipt" | "ready" | "deleted";

export function ExpensesView({
  data,
  navigate,
  onChanged,
}: {
  data: DashboardData;
  navigate: (view: ViewName) => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Expense | null>(null);
  const [restoring, setRestoring] = useState("");
  const [error, setError] = useState("");
  const expenses = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-GB");
    const source = filter === "deleted" ? data.deletedExpenses : data.expenses;
    return source
      .filter((expense) => {
        if (filter === "august" && !expense.date.startsWith("2026-08")) return false;
        if (filter === "needs-receipt" && expense.receiptStatus === "stored") return false;
        if (
          filter === "ready" &&
          (expense.receiptStatus !== "stored" ||
            data.attention.some((issue) => issue.id === expense.id))
        ) return false;
        if (!needle) return true;
        return [
          expense.merchant,
          expense.location,
          expense.reason,
          expense.mealContext,
          expense.date,
          formatMoney(expense.eligibleAmountPence),
        ].some((value) => value?.toLocaleLowerCase("en-GB").includes(needle));
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.attention, data.deletedExpenses, data.expenses, filter, query]);

  async function restore(id: string) {
    setRestoring(id);
    setError("");
    try {
      await restoreExpense(id);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expense could not be restored.");
    } finally {
      setRestoring("");
    }
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow={`${data.expenses.length} records`}
        title="Expenses"
        detail="A chronological ledger of receipted duty expenditure."
        action={<button className="primary-button" type="button" onClick={() => navigate("capture")}>Add expense</button>}
      />
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <section className="ledger-toolbar" aria-label="Expense filters">
        <label className="search-field">
          <span className="sr-only">Search expenses</span>
          <span aria-hidden="true">⌕</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant, place, reason or amount" />
        </label>
        <div className="filter-group" role="group" aria-label="Filter expenses">
          {([
            ["all", "All"],
            ["august", "August"],
            ["needs-receipt", "Needs receipt"],
            ["ready", "Ready"],
            ["deleted", `Deleted (${data.deletedExpenses.length})`],
          ] as Array<[Filter, string]>).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </section>

      {expenses.length ? (
        <section aria-label="Expense records">
          <div className="table-head" aria-hidden="true"><span>Date / merchant</span><span>Evidence</span><span>Eligible</span><span /></div>
          <ul className="expense-list full">
            {expenses.map((expense) => (
              <li key={expense.id}>
                <span className="date-stamp">{expense.date.slice(8, 10)}<small>{formatDate(expense.date).split(" ")[1]}</small></span>
                <div className="expense-main">
                  <strong>{expense.merchant}</strong>
                  <span>{expense.location || "Location needed"} · {expense.mealContext || "Unlabelled"}</span>
                  <small>{expense.reason || "Reason needed"}</small>
                </div>
                <span className={`state-label ${expense.receiptStatus === "stored" ? "success" : "warning"}`}>
                  {filter === "deleted" ? expense.locked ? "Claim locked" : "Recoverable" : expense.receiptStatus === "stored" ? "Receipt stored" : "Receipt needed"}
                </span>
                <div className="money-stack"><strong>{formatMoney(expense.eligibleAmountPence)}</strong>{expense.receiptTotalPence !== expense.eligibleAmountPence ? <small>of {formatMoney(expense.receiptTotalPence)}</small> : null}</div>
                <div className="row-actions">
                  {expense.receiptStatus === "stored" ? <a className="round-button" href={expense.receiptUrl ?? `/api/expenses/${encodeURIComponent(expense.id)}/receipt`} target="_blank" rel="noreferrer" aria-label={`View receipt for ${expense.merchant}`}>↗</a> : null}
                  {filter !== "deleted" && expense.receiptStatus !== "stored" ? (
                    <ReceiptAttachment
                      expense={expense}
                      onChanged={onChanged}
                    />
                  ) : null}
                  {filter === "deleted" ? (
                    <button className="text-button" type="button" title={expense.locked ? "Prepared claim records cannot be restored." : "Restore this expense"} disabled={expense.locked || restoring === expense.id} onClick={() => void restore(expense.id)}>{expense.locked ? "Locked" : restoring === expense.id ? "Restoring…" : "Restore"}</button>
                  ) : (
                    <button className="round-button" type="button" onClick={() => setSelected(expense)} aria-label={`Edit ${expense.merchant}`}>•••</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          title={data.expenses.length || data.deletedExpenses.length ? "No matching expenses" : "No expenses yet"}
          action={data.expenses.length || data.deletedExpenses.length ? <button className="text-button" type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : <button className="primary-button" type="button" onClick={() => navigate("capture")}>Capture a receipt</button>}
        >
          {data.expenses.length || data.deletedExpenses.length ? "Try a different term or readiness filter." : "Your first confirmed receipt will begin the ledger."}
        </EmptyState>
      )}
      {selected ? <ExpenseEditor expense={selected} trips={data.trips} onClose={() => setSelected(null)} onChanged={onChanged} /> : null}
    </div>
  );
}
