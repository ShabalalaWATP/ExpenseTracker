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
       receipt_total_pence, eligible_pence, trip_id)
    VALUES
      ('expense-1', '2026-08-01', 'Synthetic café', 'Portsmouth',
       'Synthetic duty test', 1200, 1200, 'trip-1');
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
  apply(db, await migration("0006_parched_prism.sql"));
  apply(db, await migration("0007_deep_tomorrow_man.sql"));

  const expense = db
    .prepare(
      `SELECT owner_id, deleted_at, category, original_currency,
              original_country, original_receipt_total_minor,
              original_minor_unit_digits, conversion_json, trip_leg_id
       FROM expenses WHERE id = 'expense-1'`,
    )
    .get();
  assert.equal(expense.owner_id, "singleton-owner");
  assert.equal(expense.deleted_at, null);
  assert.equal(expense.category, "food");
  assert.equal(expense.original_currency, "GBP");
  assert.equal(expense.original_country, "GB");
  assert.equal(expense.original_receipt_total_minor, 1200);
  assert.equal(expense.original_minor_unit_digits, 2);
  assert.equal(JSON.parse(expense.conversion_json).source, "identity");
  assert.equal(expense.trip_leg_id, "legacy-trip-1");
  assert.deepEqual(
    {
      ...db
        .prepare(
          `SELECT trip_id, sequence, country_code, location, start_date, end_date
           FROM trip_legs WHERE id = 'legacy-trip-1'`,
        )
        .get(),
    },
    {
      trip_id: "trip-1",
      sequence: 0,
      country_code: "GB",
      location: "Location not recorded",
      start_date: "2026-08-01",
      end_date: "2026-08-03",
    },
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('receipt_intakes', 'receipt_intake_revisions', 'audit_events', 'trip_legs', 'exchange_rate_quotes')",
      )
      .get().count,
    5,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'receipt_auto_confirm_reservations'",
      )
      .get().count,
    1,
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
      db.exec(
        "UPDATE trip_legs SET location = 'Changed' WHERE id = 'legacy-trip-1'",
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
  db.exec("DELETE FROM claim_period_locks WHERE id = 'lock-1'");
  assert.throws(
    () =>
      db.exec(
        "UPDATE trip_legs SET country_code = 'FR' WHERE id = 'legacy-trip-1'",
      ),
    /trip_leg_has_receipt_evidence/,
  );
  assert.throws(
    () => db.exec("DELETE FROM trip_legs WHERE id = 'legacy-trip-1'"),
    /trip_leg_has_receipt_evidence/,
  );
  db.exec(
    "UPDATE trip_legs SET location = 'Portsmouth' WHERE id = 'legacy-trip-1'",
  );
  assert.equal(
    db
      .prepare("SELECT location FROM trip_legs WHERE id = 'legacy-trip-1'")
      .get().location,
    "Portsmouth",
  );
  db.exec(`
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
  db.exec(`
    INSERT INTO receipt_intakes
      (id, owner_id, batch_id, status, original_name,
       original_object_key, content_type, byte_size, sha256,
       idempotency_key, service_date)
    VALUES
      ('parallel-auto-a', 'singleton-owner', 'batch-auto', 'analysing',
       'a.jpg', 'intakes/a.jpg', 'image/jpeg', 128,
       'parallel-sha-a', 'parallel-key-a', '2026-09-01'),
      ('parallel-auto-b', 'singleton-owner', 'batch-auto', 'analysing',
       'b.jpg', 'intakes/b.jpg', 'image/jpeg', 128,
       'parallel-sha-b', 'parallel-key-b', '2026-09-01'),
      ('parallel-other-owner', 'other-owner', 'batch-auto', 'analysing',
       'c.jpg', 'intakes/c.jpg', 'image/jpeg', 128,
       'parallel-sha-c', 'parallel-key-c', '2026-09-01');
    UPDATE receipt_intakes
      SET auto_confirm_token = 'lease-a',
          auto_confirm_lease_expires_at = '2999-01-01T00:00:00.000Z'
      WHERE id = 'parallel-auto-a';
    UPDATE receipt_intakes
      SET auto_confirm_token = 'lease-b',
          auto_confirm_lease_expires_at = '2999-01-01T00:00:00.000Z'
      WHERE id = 'parallel-auto-b';
    UPDATE receipt_intakes
      SET auto_confirm_token = 'lease-other',
          auto_confirm_lease_expires_at = '2999-01-01T00:00:00.000Z'
      WHERE id = 'parallel-other-owner';
  `);
  const reserve = db.prepare(`
    INSERT INTO receipt_auto_confirm_reservations
      (owner_id, fingerprint, receipt_intake_id, lease_token)
    SELECT ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM receipt_intakes
      WHERE owner_id = ? AND id = ? AND status = 'analysing'
        AND auto_confirm_token = ?
        AND auto_confirm_lease_expires_at >
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
    ON CONFLICT DO NOTHING
    RETURNING receipt_intake_id
  `);
  assert.equal(
    reserve.all(
      "singleton-owner",
      "same-merchant-date-amount",
      "parallel-auto-a",
      "lease-a",
      "singleton-owner",
      "parallel-auto-a",
      "lease-a",
    )
      .length,
    1,
  );
  assert.equal(
    reserve.all(
      "singleton-owner",
      "same-merchant-date-amount",
      "parallel-auto-b",
      "lease-b",
      "singleton-owner",
      "parallel-auto-b",
      "lease-b",
    )
      .length,
    0,
  );
  assert.equal(
    reserve.all(
      "other-owner",
      "same-merchant-date-amount",
      "parallel-other-owner",
      "lease-other",
      "other-owner",
      "parallel-other-owner",
      "lease-other",
    )
      .length,
    1,
  );
  assert.equal(
    db
      .prepare(
        "SELECT receipt_intake_id FROM receipt_auto_confirm_reservations WHERE owner_id = 'singleton-owner' AND fingerprint = 'same-merchant-date-amount'",
      )
      .get().receipt_intake_id,
    "parallel-auto-a",
  );
  const conditionalExpense = db.prepare(`
    INSERT INTO expenses (
      id, owner_id, service_date, merchant, location, business_reason,
      receipt_total_pence, eligible_pence, gratuity_pence,
      currency, country, category
    )
    SELECT ?, ?, '2026-09-01', 'Same merchant', 'London',
           'Concurrent receipt test', 1250, 1250, 0, 'GBP', 'GB', 'food'
    WHERE EXISTS (
      SELECT 1 FROM receipt_auto_confirm_reservations
      WHERE owner_id = ? AND fingerprint = ? AND receipt_intake_id = ?
        AND lease_token = ?
    ) AND EXISTS (
      SELECT 1 FROM receipt_intakes
      WHERE owner_id = ? AND id = ? AND status = 'analysing'
        AND auto_confirm_token = ?
        AND auto_confirm_lease_expires_at >
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
  `);
  assert.equal(
    conditionalExpense.run(
      "parallel-expense-a",
      "singleton-owner",
      "singleton-owner",
      "same-merchant-date-amount",
      "parallel-auto-a",
      "lease-a",
      "singleton-owner",
      "parallel-auto-a",
      "lease-a",
    ).changes,
    1,
  );
  assert.equal(
    conditionalExpense.run(
      "parallel-expense-b",
      "singleton-owner",
      "singleton-owner",
      "same-merchant-date-amount",
      "parallel-auto-b",
      "lease-b",
      "singleton-owner",
      "parallel-auto-b",
      "lease-b",
    ).changes,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM expenses WHERE id LIKE 'parallel-expense-%'",
      )
      .get().count,
    1,
  );
  db.exec(`
    INSERT INTO receipt_intakes
      (id, owner_id, batch_id, status, original_name,
       original_object_key, content_type, byte_size, sha256,
       idempotency_key, service_date, auto_confirm_token,
       auto_confirm_lease_expires_at)
    VALUES
      ('interrupted-auto', 'singleton-owner', 'batch-auto', 'analysing',
       'interrupted.jpg', 'intakes/interrupted.jpg', 'image/jpeg', 128,
       'interrupted-sha', 'interrupted-key', '2026-09-02',
       'expired-lease', '2000-01-01T00:00:00.000Z');
    INSERT INTO receipt_auto_confirm_reservations
      (owner_id, fingerprint, receipt_intake_id, lease_token)
    VALUES
      ('singleton-owner', 'interrupted-fingerprint', 'interrupted-auto',
       'expired-lease');
  `);
  const staleReservation = reserve.all(
    "singleton-owner",
    "stale-worker-fingerprint",
    "interrupted-auto",
    "expired-lease",
    "singleton-owner",
    "interrupted-auto",
    "expired-lease",
  );
  assert.equal(staleReservation.length, 0);
  const staleExpense = conditionalExpense.run(
    "stale-worker-expense",
    "singleton-owner",
    "singleton-owner",
    "interrupted-fingerprint",
    "interrupted-auto",
    "expired-lease",
    "singleton-owner",
    "interrupted-auto",
    "expired-lease",
  );
  assert.equal(staleExpense.changes, 0);
  db.exec(`
    DELETE FROM receipt_auto_confirm_reservations
    WHERE owner_id = 'singleton-owner'
      AND receipt_intake_id = 'interrupted-auto'
      AND lease_token = 'expired-lease'
      AND EXISTS (
        SELECT 1 FROM receipt_intakes
        WHERE owner_id = 'singleton-owner' AND id = 'interrupted-auto'
          AND status = 'analysing'
          AND auto_confirm_token = 'expired-lease'
          AND auto_confirm_lease_expires_at <=
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );
    UPDATE receipt_intakes
      SET status = 'needs_review',
          error_code = 'receipt_auto_confirmation_interrupted',
          auto_confirm_token = NULL,
          auto_confirm_lease_expires_at = NULL
      WHERE owner_id = 'singleton-owner' AND id = 'interrupted-auto'
        AND status = 'analysing'
        AND auto_confirm_token = 'expired-lease'
        AND auto_confirm_lease_expires_at <=
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
  `);
  assert.deepEqual(
    {
      ...db
        .prepare(
          `SELECT status, error_code, auto_confirm_token,
                  auto_confirm_lease_expires_at
           FROM receipt_intakes WHERE id = 'interrupted-auto'`,
        )
        .get(),
    },
    {
      status: "needs_review",
      error_code: "receipt_auto_confirmation_interrupted",
      auto_confirm_token: null,
      auto_confirm_lease_expires_at: null,
    },
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM receipt_auto_confirm_reservations WHERE receipt_intake_id = 'interrupted-auto'",
      )
      .get().count,
    0,
  );
  db.exec(`
    INSERT INTO receipt_intakes
      (id, owner_id, batch_id, status, original_name,
       original_object_key, content_type, byte_size, sha256,
       idempotency_key, service_date, updated_at)
    VALUES
      ('stale-tokenless', 'singleton-owner', 'batch-auto', 'analysing',
       'stale.jpg', 'intakes/stale.jpg', 'image/jpeg', 128,
       'stale-tokenless-sha', 'stale-tokenless-key', '2026-09-03',
       '2000-01-01T00:00:00.000Z'),
      ('active-tokenless', 'singleton-owner', 'batch-auto', 'analysing',
       'active.jpg', 'intakes/active.jpg', 'image/jpeg', 128,
       'active-tokenless-sha', 'active-tokenless-key', '2026-09-03',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    UPDATE receipt_intakes
      SET status = 'needs_review',
          error_code = 'receipt_processing_interrupted',
          auto_confirm_token = NULL,
          auto_confirm_lease_expires_at = NULL
      WHERE owner_id = 'singleton-owner' AND status = 'analysing'
        AND expense_id IS NULL AND auto_confirm_token IS NULL
        AND updated_at <=
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes');
  `);
  assert.equal(
    db
      .prepare(
        "SELECT status FROM receipt_intakes WHERE id = 'stale-tokenless'",
      )
      .get().status,
    "needs_review",
  );
  assert.equal(
    db
      .prepare(
        "SELECT status FROM receipt_intakes WHERE id = 'active-tokenless'",
      )
      .get().status,
    "analysing",
  );
  db.close();
});
