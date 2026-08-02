import {
  confirmIntake,
  getIntake,
  patchIntake,
  ReceiptApiError,
} from "./receiptApi";
import type { IntakePatch, ReceiptIntake } from "./types";

const CONFIRMATION_CONFLICTS = new Set([
  "receipt_analysis_in_progress",
  "receipt_changed",
  "receipt_confirmed",
]);

async function settledConfirmation(id: string): Promise<ReceiptIntake | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await getIntake(id);
    if (current.status === "confirmed") return current;
    if (current.status !== "analysing") return null;
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  return null;
}

export async function completeReceiptConfirmation(
  id: string,
  patch: IntakePatch,
): Promise<{ saved: ReceiptIntake; confirmed: ReceiptIntake }> {
  let saved: ReceiptIntake | null = null;
  try {
    saved = await patchIntake(id, patch);
    return { saved, confirmed: await confirmIntake(id, true) };
  } catch (error) {
    if (
      error instanceof ReceiptApiError &&
      error.code &&
      CONFIRMATION_CONFLICTS.has(error.code)
    ) {
      const confirmed = await settledConfirmation(id).catch(() => null);
      if (confirmed) return { saved: saved ?? confirmed, confirmed };
    }
    throw error;
  }
}
