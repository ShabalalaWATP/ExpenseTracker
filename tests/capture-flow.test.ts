import assert from "node:assert/strict";
import { it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { captureDetail } from "../app/components/capture-copy.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { initialBatchDefaultState } from "../app/components/receipt-intake/upload-queue.ts";

it("does not treat a calendar date as owner truth for an uploaded receipt", () => {
  const defaults = initialBatchDefaultState("2026-08-20");
  assert.equal(defaults.value.serviceDate, "");
  assert.match(captureDetail("2026-08-20"), /AI reads the printed date/);
  assert.match(captureDetail("2026-08-20"), /Manual entry starts/);
});
