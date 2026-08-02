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
import { CalendarDayDrawer } from "./CalendarDayDrawer";
import { formatDate, formatMoney, localDate } from "./format";
import type { Expense } from "./types";
import { ViewHeader } from "./ui";

export interface CalendarViewProps {
  expenses: readonly Expense[];
  lockedPeriods?: readonly string[];
  onAddClaim: (date: string) => void;
  onOpenClaim: (expense: Expense) => void;
  onCreateTripRange?: (startDate: string, endDate: string) => void;
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
  onCreateTripRange,
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
  const [filter, setFilter] = useState<"all" | "attention" | "missing">("all");
  const [selectingRange, setSelectingRange] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
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
  const allSelectedExpenses = byDate.get(selectedDate) ?? [];
  const selectedExpenses = allSelectedExpenses.filter((expense) => {
    if (filter === "missing") return expense.receiptStatus !== "stored";
    if (filter === "attention") {
      return (
        expense.receiptStatus !== "stored" ||
        !expense.location ||
        !expense.reason
      );
    }
    return true;
  });
  const selectedLocked = lockedPeriods.includes(selectedDate.slice(0, 7));
  const selectedSupported =
    !supportedPeriod || selectedDate.startsWith(`${supportedPeriod}-`);
  const canAddToSelected = selectedSupported && !selectedLocked;
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
    if (!selectingRange) return;
    if (!rangeStart || rangeEnd) {
      setRangeStart(date);
      setRangeEnd("");
    } else {
      setRangeStart(date < rangeStart ? date : rangeStart);
      setRangeEnd(date < rangeStart ? rangeStart : date);
    }
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
                : "Outside claim month"}
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
        <div className="filter-group calendar-filters" role="group" aria-label="Calendar entries">
          {([
            ["all", "All"],
            ["attention", "Needs attention"],
            ["missing", "Missing receipt"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {onCreateTripRange ? (
          <div className="calendar-range">
            <span aria-live="polite">
              {!selectingRange
                ? "Select duty dates for a new trip"
                : rangeStart
                ? rangeEnd
                  ? `${formatDate(rangeStart)} to ${formatDate(rangeEnd)}`
                  : `Start: ${formatDate(rangeStart)}. Choose an end date.`
                : "Choose the first duty date"}
            </span>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSelectingRange((current) => !current);
                setRangeStart("");
                setRangeEnd("");
              }}
            >
              {selectingRange ? "Cancel date selection" : "Select trip dates"}
            </button>
            <button
              className="secondary-button"
              type="button"
              hidden={!selectingRange}
              disabled={!rangeStart || !rangeEnd}
              onClick={() => {
                onCreateTripRange(rangeStart, rangeEnd);
                setSelectingRange(false);
              }}
            >
              Create trip from dates
            </button>
          </div>
        ) : null}
        <div className="calendar-period" aria-label="Displayed calendar period">
          <button
            className="round-button"
            type="button"
            onClick={() => move(-1)}
            aria-label={`Previous ${mode.replace("-", " ")}`}
          >
            ←
          </button>
          <div className="calendar-period-heading">
            <h2 aria-live="polite">{calendarRangeLabel(cursor, mode)}</h2>
            <button className="text-button" type="button" onClick={returnToToday}>
              Today
            </button>
          </div>
          <button
            className="round-button"
            type="button"
            onClick={() => move(1)}
            aria-label={`Next ${mode.replace("-", " ")}`}
          >
            →
          </button>
        </div>
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
                    selectingRange &&
                    rangeStart &&
                    date >= rangeStart &&
                    date <= (rangeEnd || rangeStart)
                      ? "range-selected"
                      : "",
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

      <CalendarDayDrawer
        date={selectedDate}
        expenses={selectedExpenses}
        allExpenseCount={allSelectedExpenses.length}
        locked={selectedLocked}
        supported={selectedSupported}
        supportedPeriod={supportedPeriod}
        onAdd={() => onAddClaim(selectedDate)}
        onClearFilter={() => setFilter("all")}
        onOpen={onOpenClaim}
      />
    </div>
  );
}
