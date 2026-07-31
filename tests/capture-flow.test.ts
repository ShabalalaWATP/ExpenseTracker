import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

it("allows a manual expense to remain explicitly marked as receipt needed", async () => {
  const manualCapture = await readFile(
    new URL(
      "../app/components/receipt-intake/ManualCapture.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(manualCapture, /I do not have the receipt/);
  assert.match(manualCapture, /Save as receipt needed/);
  assert.match(manualCapture, /if \(receiptUnavailable\) \{/);
  assert.match(manualCapture, /await onSaved\(\)/);
  assert.match(manualCapture, /marked Receipt needed in Expenses/);
});
