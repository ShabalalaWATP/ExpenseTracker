import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import * as polling from "../app/components/receipt-intake/auto-confirm-polling.ts";

type Result = Awaited<ReturnType<typeof polling.pollAutoConfirmation>>;

function result(outcome: Result["outcome"]): Result {
  return {
    outcome,
    intake: { id: "intake-1" } as Result["intake"],
    reasons: outcome === "needs_review" ? ["confidence"] : [],
  };
}

describe("automatic confirmation polling", () => {
  it("keeps polling an in-progress confirmation until it is confirmed", async () => {
    const results = [result("in_progress"), result("confirmed")];
    let calls = 0;
    let waits = 0;
    const resolved = await polling.pollAutoConfirmation(
      async () => results[calls++]!,
      { wait: async () => { waits += 1; } },
    );
    assert.equal(resolved.outcome, "confirmed");
    assert.equal(calls, 2);
    assert.equal(waits, 1);
  });

  it("returns needs-review authoritatively after an in-progress response", async () => {
    const results = [result("in_progress"), result("needs_review")];
    let calls = 0;
    const resolved = await polling.pollAutoConfirmation(
      async () => results[calls++]!,
      { wait: async () => {} },
    );
    assert.equal(resolved.outcome, "needs_review");
    assert.deepEqual(resolved.reasons, ["confidence"]);
    assert.equal(calls, 2);
  });

  it("stops at the configured bound and leaves confirmation pending", async () => {
    let calls = 0;
    let waits = 0;
    await assert.rejects(
      polling.pollAutoConfirmation(
        async () => {
          calls += 1;
          return result("in_progress");
        },
        {
          maxAttempts: 3,
          delayMs: 0,
          wait: async () => { waits += 1; },
        },
      ),
      polling.AutoConfirmationPendingError,
    );
    assert.equal(calls, 3);
    assert.equal(waits, 2);
  });
});
