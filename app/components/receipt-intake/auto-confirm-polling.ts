import type { AutoConfirmResult } from "./receiptApi";

export const AUTO_CONFIRM_MAX_ATTEMPTS = 10;
export const AUTO_CONFIRM_POLL_DELAY_MS = 2_000;
export const AUTO_CONFIRM_MAX_TRANSIENT_RETRIES = 1;

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
  maxTransientRetries?: number;
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function isRetryableRequestError(
  error: unknown,
): error is Error & { retryable: true } {
  return (
    error instanceof Error &&
    "retryable" in error &&
    error.retryable === true
  );
}

export async function pollAutoConfirmation(
  request: () => Promise<AutoConfirmResult>,
  options: PollOptions = {},
): Promise<AutoConfirmResult> {
  const maxAttempts = options.maxAttempts ?? AUTO_CONFIRM_MAX_ATTEMPTS;
  const maxTransientRetries =
    options.maxTransientRetries ?? AUTO_CONFIRM_MAX_TRANSIENT_RETRIES;
  const delayMs = options.delayMs ?? AUTO_CONFIRM_POLL_DELAY_MS;
  const wait = options.wait ?? waitFor;
  let transientRetries = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let result: AutoConfirmResult;
    try {
      result = await request();
    } catch (error) {
      if (
        !isRetryableRequestError(error) ||
        transientRetries >= maxTransientRetries ||
        attempt + 1 >= maxAttempts
      ) {
        throw error;
      }
      transientRetries += 1;
      await wait(delayMs);
      continue;
    }
    if (result.outcome !== "in_progress") return result;
    if (attempt + 1 < maxAttempts) await wait(delayMs);
  }
  throw new AutoConfirmationPendingError();
}
