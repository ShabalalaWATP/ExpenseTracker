import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { duplicateReason } from "../src/domain/receipt-duplicate-match.ts";

test("possible duplicates explain the deterministic match", () => {
  const values = {
    merchant: "Harbour Café",
    serviceDate: "2026-08-14",
    receiptTotalPence: 1275,
  };
  assert.equal(
    duplicateReason(
      {
        merchant: "Another café",
        service_date: "2026-08-14",
        receipt_total_pence: 1275,
      },
      values,
    ),
    "Same date and receipt total",
  );
  assert.equal(
    duplicateReason(
      {
        merchant: "Harbour Café",
        service_date: "2026-08-14",
        receipt_total_pence: 1300,
      },
      values,
    ),
    "Same merchant and date",
  );
});
