import type { NavigationTarget, ViewName } from "./types";

const views = new Set<ViewName>([
  "today",
  "capture",
  "calendar",
  "expenses",
  "trips",
  "claims",
  "statistics",
  "audit",
  "policy",
  "settings",
]);

function safeId(value: string | null): string | undefined {
  return value && /^[a-zA-Z0-9-]{1,100}$/.test(value) ? value : undefined;
}

function safeDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

export function parseNavigationHash(hash: string): NavigationTarget {
  const [rawView, rawQuery = ""] = hash.replace(/^#/, "").split("?", 2);
  const migratedView = rawView === "claims" ? "expenses" : rawView;
  const view = views.has(migratedView as ViewName)
    ? (migratedView as ViewName)
    : "capture";
  const query = new URLSearchParams(rawQuery);
  return {
    view,
    intakeId: safeId(query.get("intake")),
    expenseId: safeId(query.get("expense")),
    tripId: safeId(query.get("trip")),
    date: safeDate(query.get("date")),
    startDate: safeDate(query.get("start")),
    endDate: safeDate(query.get("end")),
  };
}

export function navigationHash(target: NavigationTarget): string {
  const query = new URLSearchParams();
  if (target.intakeId) query.set("intake", target.intakeId);
  if (target.expenseId) query.set("expense", target.expenseId);
  if (target.tripId) query.set("trip", target.tripId);
  if (target.date) query.set("date", target.date);
  if (target.startDate) query.set("start", target.startDate);
  if (target.endDate) query.set("end", target.endDate);
  const suffix = query.toString();
  return `#${target.view}${suffix ? `?${suffix}` : ""}`;
}

export function replaceNavigationTarget(
  history: {
    replaceState(data: unknown, unused: string, url?: string | URL | null): void;
  },
  target: NavigationTarget,
): void {
  history.replaceState({ target }, "", navigationHash(target));
}
