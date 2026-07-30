export type StatisticsRange = "week" | "month" | "three_months" | "annual";

export type StatisticsPeriod = {
  range: StatisticsRange;
  anchorDate: string;
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  label: string;
  comparisonLabel: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function validAnchor(anchorDate: string): Date {
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(anchorDate)
    ? new Date(`${anchorDate}T00:00:00Z`)
    : new Date(Number.NaN);
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function dateUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function addDays(date: Date, days: number): Date {
  return dateUtc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateLabel(date: Date): string {
  return DATE_FORMAT.format(date);
}

export function statisticsPeriod(
  range: StatisticsRange,
  anchorDate: string,
): StatisticsPeriod {
  const anchor = validAnchor(anchorDate);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  let start: Date;
  let end: Date;
  let previousStart: Date;
  let previousEnd: Date;
  let label: string;
  let comparisonLabel: string;

  if (range === "week") {
    const daysFromMonday = (anchor.getUTCDay() + 6) % 7;
    start = addDays(anchor, -daysFromMonday);
    end = addDays(start, 6);
    previousStart = addDays(start, -7);
    previousEnd = addDays(start, -1);
    label = `${dateLabel(start)} to ${dateLabel(end)}`;
    comparisonLabel = "the previous week";
  } else if (range === "three_months") {
    start = dateUtc(year, month - 2, 1);
    end = dateUtc(year, month + 1, 0);
    previousStart = dateUtc(year, month - 5, 1);
    previousEnd = dateUtc(year, month - 2, 0);
    label = `${MONTH_FORMAT.format(start)} to ${MONTH_FORMAT.format(end)}`;
    comparisonLabel = "the previous 3 months";
  } else if (range === "annual") {
    start = dateUtc(year, 0, 1);
    end = dateUtc(year, 11, 31);
    previousStart = dateUtc(year - 1, 0, 1);
    previousEnd = dateUtc(year - 1, 11, 31);
    label = String(year);
    comparisonLabel = "the previous year";
  } else {
    start = dateUtc(year, month, 1);
    end = dateUtc(year, month + 1, 0);
    previousStart = dateUtc(year, month - 1, 1);
    previousEnd = dateUtc(year, month, 0);
    label = MONTH_FORMAT.format(start);
    comparisonLabel = "the previous month";
  }

  return {
    range,
    anchorDate: isoDate(anchor),
    startDate: isoDate(start),
    endDate: isoDate(end),
    previousStartDate: isoDate(previousStart),
    previousEndDate: isoDate(previousEnd),
    label,
    comparisonLabel,
  };
}
