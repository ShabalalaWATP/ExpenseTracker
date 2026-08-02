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

export function sharedReceiptServiceAdjustment(
  value: string,
  eligiblePence: number | null,
  gratuityPence: number,
  shared: boolean,
): number {
  if (!shared || eligiblePence === null || gratuityPence <= 0) return 0;
  const claimedTotal = reconciliationLines(value)
    .filter((line) => line.eligible === true)
    .reduce(
      (sum, line) =>
        sum +
        (Number.isSafeInteger(line.claimedTotalPence)
          ? Number(line.claimedTotalPence)
          : Number(line.totalPence ?? 0)),
      0,
    );
  return eligiblePence - claimedTotal === gratuityPence ? gratuityPence : 0;
}
