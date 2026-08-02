import type { ReconciliationLine } from "./receipt-reconciliation";

export function reconciliationLines(value: string): ReconciliationLine[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        totalPence: Number.isSafeInteger(item.totalPence)
          ? (item.totalPence as number)
          : null,
        eligible:
          typeof item.eligible === "boolean" ? item.eligible : null,
        claimedTotalPence: Number.isSafeInteger(item.claimedTotalPence)
          ? (item.claimedTotalPence as number)
          : null,
      }));
  } catch {
    return [];
  }
}
