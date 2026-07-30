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
  apply(db, await migration("0002_dapper_speedball.sql"));
  db.exec(`
    INSERT INTO receipts
      (id, owner_id, expense_id, object_key, content_type, byte_size, sha256,
       idempotency_key)
    VALUES
      ('receipt-1', 'singleton-owner', 'expense-1', 'receipts/receipt-1.jpg',
       'image/jpeg', 128, 'synthetic-sha', 'synthetic-idempotency');
    UPDATE expenses
      SET deleted_at = '2026-07-29T12:00:00.000Z'
      WHERE id = 'expense-1';
  `);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM receipts").get().count,
    1,
  );
  db.exec("UPDATE expenses SET deleted_at = NULL WHERE id = 'expense-1'");
  apply(db, await migration("0003_neat_runaways.sql"));
  apply(db, await migration("0004_woozy_gravity.sql"));
  apply(db, await migration("0005_rapid_slapstick.sql"));

  const expense = db
    .prepare(
      "SELECT owner_id, deleted_at, category FROM expenses WHERE id = 'expense-1'",
    )
    .get();
  assert.equal(expense.owner_id, "singleton-owner");
  assert.equal(expense.deleted_at, null);
  assert.equal(expense.category, "food");
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('receipt_intakes', 'receipt_intake_revisions', 'audit_events')",
      )
      .get().count,
    3,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'expenses_owner_date_idx'",
      )
      .get().count,
    1,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'expenses_owner_deleted_idx'",
      )
      .get().count,
    1,
  );
  db.exec(`
    INSERT INTO claim_period_locks
      (id, owner_id, period, status, token)
    VALUES
      ('lock-1', 'singleton-owner', '2026-08', 'preparing', 'token-1');
  `);
  assert.throws(
    () =>
      db.exec(
        "UPDATE expenses SET merchant = 'Changed' WHERE id = 'expense-1'",
      ),
    /claim_period_locked/,
  );
  assert.throws(
    () =>
      db.exec(`
        INSERT INTO receipt_intakes
          (id, owner_id, batch_id, status, original_name,
           original_object_key, content_type, byte_size, sha256,
           idempotency_key, service_date)
        VALUES
          ('undated-intake', 'singleton-owner', 'batch-1', 'uploaded',
           'receipt.jpg', 'intakes/receipt.jpg', 'image/jpeg', 128,
           'undated-sha', 'undated-idempotency', NULL)
      `),
    /claim_period_locked/,
  );
  assert.equal(
    db.prepare("SELECT merchant FROM expenses WHERE id = 'expense-1'").get()
      .merchant,
    "Synthetic café",
  );
  db.exec(`
    DELETE FROM claim_period_locks WHERE id = 'lock-1';
    INSERT INTO receipt_intakes
      (id, owner_id, batch_id, status, original_name,
       original_object_key, content_type, byte_size, sha256,
       idempotency_key, service_date)
    VALUES
      ('race-intake', 'singleton-owner', 'batch-race', 'uploaded',
       'race.jpg', 'intakes/race.jpg', 'image/jpeg', 128,
       'race-sha', 'race-idempotency', '2026-08-02');
    UPDATE receipt_intakes
      SET status = 'analysing',
          updated_at = '2026-07-29T12:01:00.000Z'
      WHERE id = 'race-intake';
  `);
  const blockedLock = db
    .prepare(`
      INSERT INTO claim_period_locks
        (id, owner_id, period, status, token)
      SELECT ?, ?, ?, 'preparing', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM receipt_intakes
        WHERE owner_id = ?
          AND status = 'analysing'
          AND (service_date IS NULL OR substr(service_date, 1, 7) = ?)
      )
    `)
    .run(
      "race-lock-blocked",
      "singleton-owner",
      "2026-08",
      "race-token-blocked",
      "singleton-owner",
      "2026-08",
    );
  assert.equal(blockedLock.changes, 0);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM claim_period_locks WHERE id = 'race-lock-blocked'",
      )
      .get().count,
    0,
  );
  db.exec("UPDATE receipt_intakes SET status = 'ready' WHERE id = 'race-intake'");
  const acquiredLock = db
    .prepare(`
      INSERT INTO claim_period_locks
        (id, owner_id, period, status, token)
      SELECT ?, ?, ?, 'preparing', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM receipt_intakes
        WHERE owner_id = ?
          AND status = 'analysing'
          AND (service_date IS NULL OR substr(service_date, 1, 7) = ?)
      )
    `)
    .run(
      "race-lock-acquired",
      "singleton-owner",
      "2026-08",
      "race-token-acquired",
      "singleton-owner",
      "2026-08",
    );
  assert.equal(acquiredLock.changes, 1);
  assert.throws(
    () =>
      db.exec(
        "UPDATE receipt_intakes SET status = 'analysing' WHERE id = 'race-intake'",
      ),
    /claim_period_locked/,
  );
  assert.equal(
    db.prepare("SELECT status FROM receipt_intakes WHERE id = 'race-intake'").get()
      .status,
    "ready",
  );
  db.exec("DELETE FROM claim_period_locks WHERE id = 'race-lock-acquired'");

  const deleteSnapshot = db
    .prepare(
      "SELECT updated_at FROM receipt_intakes WHERE id = 'race-intake'",
    )
    .get();
  db.exec(`
    UPDATE receipt_intakes
      SET status = 'analysing',
          updated_at = '2026-07-29T12:02:00.000Z'
      WHERE id = 'race-intake'
  `);
  const rejectedDelete = db
    .prepare(`
      DELETE FROM receipt_intakes
      WHERE owner_id = ? AND id = ?
        AND status NOT IN ('analysing', 'confirmed')
        AND expense_id IS NULL
        AND updated_at = ?
      RETURNING id
    `)
    .all("singleton-owner", "race-intake", deleteSnapshot.updated_at);
  assert.equal(rejectedDelete.length, 0);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM receipt_intakes WHERE id = 'race-intake'",
      )
      .get().count,
    1,
  );
  db.close();
});
