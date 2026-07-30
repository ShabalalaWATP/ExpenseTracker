// OpenAI receipt extraction has a hard 60-second deadline, followed by a
// bounded currency lookup. Two minutes protects healthy work while allowing
// interrupted mobile requests to be recovered promptly.
export const STALE_RECEIPT_ANALYSIS_MS = 2 * 60_000;
export const STALE_RECEIPT_ANALYSIS_MINUTES =
  STALE_RECEIPT_ANALYSIS_MS / 60_000;

export function isStaleReceiptAnalysis(
  updatedAt: string,
  now = Date.now(),
): boolean {
  const updated = new Date(updatedAt).valueOf();
  return Number.isFinite(updated) &&
    now - updated >= STALE_RECEIPT_ANALYSIS_MS;
}
