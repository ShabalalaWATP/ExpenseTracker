import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import * as policy from "../src/shared/receipt-processing-policy.ts";

describe("receipt processing recovery policy", () => {
  it("protects active analysis while recovering interrupted work promptly", () => {
    assert.equal(policy.STALE_RECEIPT_ANALYSIS_MINUTES, 2);
    assert.equal(policy.STALE_RECEIPT_ANALYSIS_MS, 120_000);
    const now = Date.parse("2026-07-30T20:00:00.000Z");
    assert.equal(
      policy.isStaleReceiptAnalysis("2026-07-30T19:58:00.000Z", now),
      true,
    );
    assert.equal(
      policy.isStaleReceiptAnalysis("2026-07-30T19:58:00.001Z", now),
      false,
    );
    assert.equal(policy.isStaleReceiptAnalysis("not-a-date", now), false);
  });
});
