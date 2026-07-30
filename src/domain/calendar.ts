const UK_TIME_ZONE = "Europe/London";

export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function isIsoCalendarMonth(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}-01T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 7) === value
  );
}

export function claimableAmountIndex(lines: unknown): Map<string, number> {
  const result = new Map<string, number>();
  if (!Array.isArray(lines)) return result;
  for (const value of lines) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const line = value as Record<string, unknown>;
    if (
      typeof line.expenseId === "string" &&
      line.expenseId &&
      Number.isSafeInteger(line.claimablePence)
    ) {
      result.set(line.expenseId, line.claimablePence as number);
    }
  }
  return result;
}

export function ukCalendarDate(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function ukCalendarMonth(at = new Date()): string {
  return ukCalendarDate(at).slice(0, 7);
}
