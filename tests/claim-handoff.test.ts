import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { claimPeriodExpenses, claimDescription, claimHandoffText } from "../app/components/claim-handoff.ts";

type Expense = Parameters<typeof claimDescription>[0];

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    date: "2026-08-14",
    merchant: "Harbour Café",
    receiptTotalPence: 1250,
    eligibleAmountPence: 1250,
    country: "GB",
    location: "Portsmouth",
    reason: "Authorised duty",
    ...overrides,
  };
}

describe("claim handoff", () => {
  it("builds a copy-ready where-and-why description", () => {
    assert.equal(
      claimDescription(expense()),
      "Portsmouth. Authorised duty",
    );
  });

  it("includes only the selected month in chronological order", () => {
    const records = claimPeriodExpenses([
      expense({ id: "later", date: "2026-08-20" }),
      expense({ id: "outside", date: "2026-09-01" }),
      expense({ id: "earlier", date: "2026-08-02" }),
    ], "2026-08");
    assert.deepEqual(records.map((item) => item.id), ["earlier", "later"]);
  });

  it("creates a complete text handoff", () => {
    assert.equal(
      claimHandoffText([expense()], "2026-08"),
      "2026-08-14 · Harbour Café\nPortsmouth. Authorised duty",
    );
  });
});
