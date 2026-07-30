import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/server/receipt-intake-expense.ts", import.meta.url),
  "utf8",
);

function commaSeparatedValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

describe("receipt expense SQL", () => {
  it("keeps automatic and owner-confirmed inserts aligned with the expense schema", () => {
    const inserts = [
      ...source.matchAll(
        /`INSERT INTO expenses \(([\s\S]*?)\)\s*SELECT ([\s\S]*?)\s*WHERE/g,
      ),
    ];

    assert.equal(inserts.length, 2);
    for (const insert of inserts) {
      const columns = commaSeparatedValues(insert[1]!);
      const values = commaSeparatedValues(insert[2]!);
      assert.equal(columns.length, 26);
      assert.equal(values.length, columns.length);
    }

    const selectPlaceholderCounts = inserts.map(
      (insert) => (insert[0].match(/\?/g) ?? []).length,
    );
    assert.deepEqual(selectPlaceholderCounts, [25, 25]);
  });
});
