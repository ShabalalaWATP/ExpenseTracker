import type { IntakeStatus, ReceiptIntake } from "./types";

export type ReceiptRecoveryAction =
  | "upload"
  | "analyse"
  | "poll"
  | "confirm"
  | "show"
  | "cleanup";

export function receiptRecoveryAction(
  status?: IntakeStatus,
): ReceiptRecoveryAction {
  switch (status) {
    case undefined:
      return "upload";
    case "uploaded":
      return "analyse";
    case "analysing":
      return "poll";
    case "ready":
      return "confirm";
    case "needs_review":
    case "failed":
      return "show";
    case "confirmed":
      return "cleanup";
  }
}

export async function pollAnalysingReceipt(
  id: string,
  fetchIntakes: () => Promise<ReceiptIntake[]>,
  options: {
    attempts?: number;
    delayMs?: number;
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<ReceiptIntake | null> {
  const attempts = options.attempts ?? 6;
  const delayMs = options.delayMs ?? 2_000;
  const wait =
    options.wait ??
    ((delay: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, delay)));
  let latest: ReceiptIntake | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = (await fetchIntakes()).find((intake) => intake.id === id) ?? null;
    if (!latest || latest.status !== "analysing") return latest;
    if (attempt + 1 < attempts) await wait(delayMs);
  }
  return latest;
}

export class ReceiptRecoveryPendingError extends Error {
  constructor() {
    super(
      "Receipt analysis is still running. Retry to check its status without reading the receipt again.",
    );
    this.name = "ReceiptRecoveryPendingError";
  }
}
