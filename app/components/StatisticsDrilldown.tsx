"use client";

import { useEffect, useRef } from "react";
import { categoryLabel, type Expense } from "./types";
import { formatDate, formatMoney } from "./format";

export function StatisticsDrilldown({
  title,
  expenses,
  onClose,
  onOpenExpense,
}: {
  title: string;
  expenses: Expense[];
  onClose: () => void;
  onOpenExpense: (expense: Expense) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <aside className="editor-panel stats-inspector" role="dialog" aria-modal="true" aria-labelledby="stats-inspector-title">
      <div className="editor-top">
        <div>
          <p className="eyebrow">Statistics selection</p>
          <h2 id="stats-inspector-title" ref={heading} tabIndex={-1}>{title}</h2>
        </div>
        <button className="round-button" type="button" onClick={onClose} aria-label="Close statistics selection">×</button>
      </div>
      <div className="stats-drilldown">
        <p>{expenses.length} {expenses.length === 1 ? "claim" : "claims"} in this selection.</p>
        <ol>
          {expenses.map((expense) => (
            <li key={expense.id}>
              <button type="button" onClick={() => onOpenExpense(expense)}>
                <span>
                  <strong>{expense.merchant}</strong>
                  <small>{expense.location || "Location not identified"} · {formatDate(expense.date)}</small>
                  <small>{categoryLabel(expense.category)}{expense.mealContext ? ` · ${expense.mealContext}` : ""}</small>
                </span>
                <b>{formatMoney(expense.eligibleAmountPence)}</b>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
