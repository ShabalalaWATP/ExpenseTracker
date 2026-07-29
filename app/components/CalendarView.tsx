"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import {
  CALENDAR_MODES,
  WEEKDAYS,
  calendarDates,
  calendarRangeLabel,
  longCalendarDate,
  moveCalendarDate,
  parseCalendarDate,
  type CalendarMode,
} from "./calendar-model";
import { formatMoney, localDate } from "./format";
import type { Expense } from "./types";
import { EmptyState, ViewHeader } from "./ui";

export interface CalendarViewProps {
  expenses: readonly Expense[];
  lockedPeriods?: readonly string[];
  onAddClaim: (date: string) => void;
  onOpenClaim: (expense: Expense) => void;
  initialDate?: string;
  initialMode?: CalendarMode;
  supportedPeriod?: string;
}
function calendarAmount(expense: Expense): number {
  return expense.claimableAmountPence ?? expense.eligibleAmountPence;
}

export function CalendarView({
  expenses,
  lockedPeriods = [],
  onAddClaim,
  onOpenClaim,
  initialDate = localDate(),
  initialMode = "working-week",
  supportedPeriod,
}: CalendarViewProps) {
  const safeInitialDate = parseCalendarDate(initialDate)
    .toISOString()
    .slice(0, 10);
  const [mode, setMode] = useState<CalendarMode>(initialMode);
  const [cursor, setCursor] = useState(safeInitialDate);
  const [selectedDate, setSelectedDate] = useState(safeInitialDate);
  const today = localDate();

  const activeExpenses = useMemo(
    () => expenses.filter((expense) => !expense.deletedAt),
    [expenses],
  );
  const byDate = useMemo(() => {
    const index = new Map<string, Expense[]>();
    activeExpenses.forEach((expense) => {
      const date = expense.date.slice(0, 10);
      index.set(date, [...(index.get(date) ?? []), expense]);
    });
    index.forEach((items) => items.sort((a, b) => a.merchant.localeCompare(b.merchant)));
    return index;
  }, [activeExpenses]);
  const dates = useMemo(() => calendarDates(cursor, mode), [cursor, mode]);
  const columns = mode === "working-week" ? 5 : 7;
  const dateRows = Array.from(
    { length: Math.ceil(dates.length / columns) },
    (_, index) => dates.slice(index * columns, (index + 1) * columns),
  );
  const selectedExpenses = byDate.get(selectedDate) ?? [];
  const selectedLocked = lockedPeriods.includes(selectedDate.slice(0, 7));
  const selectedSupported =
    !supportedPeriod || selectedDate.startsWith(`${supportedPeriod}-`);
  const canAddToSelected = selectedSupported && !selectedLocked;
  const selectedTotal = selectedExpenses.reduce(
    (total, expense) => total + calendarAmount(expense),
    0,
  );
  const cursorMonth = parseCalendarDate(cursor).getUTCMonth();

  function changeMode(next: CalendarMode) {
    setMode(next);
    const nextDates = calendarDates(selectedDate, next);
    const nextSelected = nextDates.includes(selectedDate)
      ? selectedDate
      : nextDates[0];
    setSelectedDate(nextSelected);
    setCursor(nextSelected);
  }

  function move(direction: -1 | 1) {
    const next = moveCalendarDate(cursor, mode, direction);
    setCursor(next);
    setSelectedDate(next);
  }
  function selectDay(date: string) {
    setSelectedDate(date);
    setCursor(date);
  }

  function returnToToday() {
    setSelectedDate(today);
    setCursor(today);
  }

  function focusDay(date: string) {
    selectDay(date);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-calendar-date="${date}"]`)
        ?.focus();
    });
  }

  function handleDayKey(
    event: KeyboardEvent<HTMLButtonElement>,
    date: string,
  ) {
    const index = dates.indexOf(date);
    const movement: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
      Home: -index,
      End: dates.length - index - 1,
    };
    const delta = movement[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(dates.length - 1, index + delta));
    focusDay(dates[nextIndex]);
  }

  return (
    <div className="view page-enter calendar-view">
      <ViewHeader
        eyebrow="Receipts and claims"
        title="Calendar"
        detail="Choose a day to view its entries, open receipt evidence or add another receipt."
        action={
          <button
            className="primary-button"
            type="button"
            disabled={!canAddToSelected}
            onClick={() => onAddClaim(selectedDate)}
          >
            {selectedLocked
              ? "Claim prepared"
              : selectedSupported
                ? "Add receipt"
                : "Outside August"}
          </button>
        }
      />

      <section className="calendar-toolbar" aria-label="Calendar controls">
        <div className="filter-group calendar-modes" role="group" aria-label="Calendar view">
          {CALENDAR_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mode === item.id ? "active" : ""}
              aria-pressed={mode === item.id}
              onClick={() => changeMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="calendar-navigation">
          <button className="round-button" type="button" onClick={() => move(-1)} aria-label={`Previous ${mode.replace("-", " ")}`}>←</button>
          <button className="text-button" type="button" onClick={returnToToday}>Today</button>
          <button className="round-button" type="button" onClick={() => move(1)} aria-label={`Next ${mode.replace("-", " ")}`}>→</button>
        </div>
        <h2 aria-live="polite">{calendarRangeLabel(cursor, mode)}</h2>
      </section>

      <div className={`calendar-grid ${mode}`} role="grid" aria-label={calendarRangeLabel(cursor, mode)}>
        <div className="calendar-row" role="row">
          {WEEKDAYS.slice(0, columns).map((day) => (
            <span className="calendar-weekday" role="columnheader" key={day}>{day}</span>
          ))}
        </div>
        {dateRows.map((row) => (
          <div className="calendar-row" role="row" key={row[0]}>
            {row.map((date) => {
              const dayExpenses = byDate.get(date) ?? [];
              const total = dayExpenses.reduce(
                (sum, expense) => sum + calendarAmount(expense),
                0,
              );
              const isOutsideMonth =
                mode === "month" &&
                parseCalendarDate(date).getUTCMonth() !== cursorMonth;
              return (
                <button
                  className={[
                    "calendar-day",
                    date === selectedDate ? "selected" : "",
                    date === today ? "today" : "",
                    isOutsideMonth ? "outside-month" : "",
                  ].filter(Boolean).join(" ")}
                  type="button"
                  role="gridcell"
                  key={date}
                  aria-selected={date === selectedDate}
                  aria-label={`${longCalendarDate(date)}, ${dayExpenses.length} ${dayExpenses.length === 1 ? "claim" : "claims"}${total ? `, ${formatMoney(total)}` : ""}`}
                  data-calendar-date={date}
                  tabIndex={date === selectedDate ? 0 : -1}
                  onClick={() => selectDay(date)}
                  onKeyDown={(event) => handleDayKey(event, date)}
                >
                  <time dateTime={date}>
                    {parseCalendarDate(date).getUTCDate()}
                  </time>
                  {dayExpenses.length ? (
                    <span className="calendar-day-summary">
                      <b>{formatMoney(total)}</b>
                      <small>{dayExpenses.length} {dayExpenses.length === 1 ? "claim" : "claims"}</small>
                    </span>
                  ) : <small className="calendar-empty-day">No claims</small>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <section className="calendar-inspector" aria-labelledby="selected-day-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Selected day</p>
            <h2 id="selected-day-heading">{longCalendarDate(selectedDate)}</h2>
          </div>
          <div className="calendar-selected-total">
            <strong>{formatMoney(selectedTotal)}</strong>
            <small>
              {selectedExpenses.length} {selectedExpenses.length === 1 ? "claim" : "claims"}
              {selectedLocked ? " · period locked" : ""}
              {!selectedSupported ? ` · ${supportedPeriod ?? "this period"} only` : ""}
            </small>
          </div>
        </div>

        {selectedExpenses.length ? (
          <ul className="calendar-claim-list">
            {selectedExpenses.map((expense) => {
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
                  <button className="calendar-claim-main" type="button" onClick={() => onOpenClaim(expense)}>
                    <strong>{expense.merchant || "Unnamed claim"}</strong>
                    <span>{expense.location || "Location needed"} · {expense.mealContext || "Meal not set"}</span>
                    <small>{expense.reason || "Reason needed"}</small>
                  </button>
                  <span className="money-stack">
                    <strong>{formatMoney(calendarAmount(expense))}</strong>
                    <small>{expense.claimableAmountPence === undefined ? "Eligible" : "Claimable"}</small>
                  </span>
                  <button className="round-button" type="button" onClick={() => onOpenClaim(expense)} aria-label={`Open claim from ${expense.merchant}`}>→</button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No claims on this day"
            action={
              <button
                className="primary-button"
                type="button"
                disabled={!canAddToSelected}
                onClick={() => onAddClaim(selectedDate)}
              >
                {selectedLocked
                  ? "Prepared period is locked"
                  : selectedSupported
                    ? "Add receipt for this date"
                    : "Only August 2026 can be claimed"}
              </button>
            }
          >
            Capture a receipt now, or choose another day.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
