import { localDate } from "./format";

export type CalendarMode = "working-week" | "week" | "month";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const CALENDAR_MODES: Array<{ id: CalendarMode; label: string }> = [
  { id: "working-week", label: "Working week" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const DAY_MS = 86_400_000;

export function parseCalendarDate(value: string): Date {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf())
    ? parseCalendarDate(localDate())
    : parsed;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.valueOf() + days * DAY_MS);
}

function shiftMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 12),
  );
}

function mondayOf(date: Date): Date {
  const day = date.getUTCDay() || 7;
  return shiftDays(date, 1 - day);
}

export function calendarDates(anchor: string, mode: CalendarMode): string[] {
  const date = parseCalendarDate(anchor);
  if (mode !== "month") {
    const monday = mondayOf(date);
    const length = mode === "working-week" ? 5 : 7;
    return Array.from({ length }, (_, index) =>
      isoDate(shiftDays(monday, index)),
    );
  }

  const first = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12),
  );
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
  );
  const start = mondayOf(first);
  const end = shiftDays(mondayOf(last), 6);
  const length = Math.round((end.valueOf() - start.valueOf()) / DAY_MS) + 1;
  return Array.from({ length }, (_, index) =>
    isoDate(shiftDays(start, index)),
  );
}

export function moveCalendarDate(
  anchor: string,
  mode: CalendarMode,
  direction: -1 | 1,
): string {
  const current = parseCalendarDate(anchor);
  return isoDate(
    mode === "month"
      ? shiftMonths(current, direction)
      : shiftDays(current, direction * 7),
  );
}

export function calendarRangeLabel(
  anchor: string,
  mode: CalendarMode,
): string {
  const date = parseCalendarDate(anchor);
  if (mode === "month") {
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  const dates = calendarDates(anchor, mode).map(parseCalendarDate);
  const start = dates[0];
  const end = dates[dates.length - 1];
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    timeZone: "UTC",
  });
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  const year = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    timeZone: "UTC",
  });
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${day.format(start)} ${month.format(start)} ${year.format(start)} – ${day.format(end)} ${month.format(end)} ${year.format(end)}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${day.format(start)} ${month.format(start)} – ${day.format(end)} ${month.format(end)} ${year.format(end)}`;
  }
  return `${day.format(start)}–${day.format(end)} ${month.format(end)} ${year.format(end)}`;
}

export function longCalendarDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseCalendarDate(value));
}
