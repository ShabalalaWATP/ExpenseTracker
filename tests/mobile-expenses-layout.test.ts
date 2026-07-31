import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the Expenses filters inside the iPhone viewport", async () => {
  const styles = await readFile(
    new URL("../app/styles/ledgers.css", import.meta.url),
    "utf8",
  );

  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*\.ledger-toolbar,[\s\S]*\.ledger-controls,[\s\S]*\.search-field,[\s\S]*\.filter-group[\s\S]*width: 100%;[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/,
  );
});
