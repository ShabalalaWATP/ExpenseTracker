import type { AutoConfirmResult } from "./receiptApi";

export const AUTO_CONFIRM_MAX_ATTEMPTS = 10;
export const AUTO_CONFIRM_POLL_DELAY_MS = 2_000;

export class AutoConfirmationPendingError extends Error {
  constructor() {
    super(
      "Receipt confirmation is still running. Retry to check its status.",
    );
    this.name = "AutoConfirmationPendingError";
  }
}

type PollOptions = {
  maxAttempts?: number;
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export async function pollAutoConfirmation(
  request: () => Promise<AutoConfirmResult>,
  options: PollOptions = {},
): Promise<AutoConfirmResult> {
  const maxAttempts = options.maxAttempts ?? AUTO_CONFIRM_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? AUTO_CONFIRM_POLL_DELAY_MS;
  const wait = options.wait ?? waitFor;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await request();
    if (result.outcome !== "in_progress") return result;
    if (attempt + 1 < maxAttempts) await wait(delayMs);
  }
  throw new AutoConfirmationPendingError();
}
