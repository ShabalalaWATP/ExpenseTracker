import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migration(name) {
  return readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
}

function apply(db, sql) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

test("owner migration preserves version 1 data and adds intake tables", async () => {
  const db = new DatabaseSync(":memory:");
  apply(db, await migration("0000_clear_big_bertha.sql"));
  db.exec(`
    INSERT INTO trips
      (id, name, country, start_date, end_date)
    VALUES
      ('trip-1', 'August duty', 'GB', '2026-08-01', '2026-08-03');
    INSERT INTO trip_days
      (id, trip_id, date, eligible, confirmed)
    VALUES
      ('day-1', 'trip-1', '2026-08-01', 1, 1);
    INSERT INTO expenses
      (id, service_date, merchant, location, business_reason,
       receipt_total_pence, eligible_pence)
    VALUES
      ('expense-1', '2026-08-01', 'Synthetic café', 'Portsmouth',
       'Synthetic duty test', 1200, 1200);
  `);

  apply(db, await migration("0001_good_zzzax.sql"));

  const expense = db
    .prepare("SELECT owner_id FROM expenses WHERE id = 'expense-1'")
    .get();
  assert.equal(expense.owner_id, "singleton-owner");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('receipt_intakes', 'audit_events')",
      )
      .get().count,
    2,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'expenses_owner_date_idx'",
      )
      .get().count,
    1,
  );
  db.close();
});
