import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { deleteReceiptIntakeAfterRecord } from "../src/server/receipt-intake-deletion.ts";

test("a claim-lock rejection preserves the intake and every receipt object", async () => {
  const rowPresent = true;
  const objects = new Set(["receipts/original", "receipts/analysis"]);
  const deleteCalls: string[] = [];

  await assert.rejects(
    deleteReceiptIntakeAfterRecord(
      {
        originalObjectKey: "receipts/original",
        analysisObjectKey: "receipts/analysis",
      },
      async () => {
        assert.equal(rowPresent, true);
        throw new Error("claim_period_locked");
      },
      {
        async delete(key: string) {
          deleteCalls.push(key);
          objects.delete(key);
        },
      },
    ),
    /claim_period_locked/,
  );

  assert.equal(rowPresent, true);
  assert.deepEqual(deleteCalls, []);
  assert.deepEqual(
    [...objects].sort(),
    ["receipts/analysis", "receipts/original"],
  );
});

test("receipt objects are removed only after the database record", async () => {
  const events: string[] = [];

  await deleteReceiptIntakeAfterRecord(
    {
      originalObjectKey: "receipts/original",
      analysisObjectKey: null,
    },
    async () => {
      events.push("database");
    },
    {
      async delete(key: string) {
        events.push(`object:${key}`);
      },
    },
  );

  assert.deepEqual(events, ["database", "object:receipts/original"]);
});
