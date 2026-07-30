function directPeriodTriggers(
  table: string,
  dateColumn: string,
): string[] {
  const locked = (row: "OLD" | "NEW") => `EXISTS (
    SELECT 1 FROM claim_period_locks
    WHERE owner_id = ${row}.owner_id
      AND period = substr(${row}.${dateColumn}, 1, 7)
  )`;
  return [
    `CREATE TRIGGER IF NOT EXISTS ${table}_claim_lock_insert
     BEFORE INSERT ON ${table}
     WHEN ${locked("NEW")}
     BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_claim_lock_update
     BEFORE UPDATE ON ${table}
     WHEN ${locked("OLD")} OR ${locked("NEW")}
     BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
    `CREATE TRIGGER IF NOT EXISTS ${table}_claim_lock_delete
     BEFORE DELETE ON ${table}
     WHEN ${locked("OLD")}
     BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  ];
}

function receiptLocked(row: "OLD" | "NEW") {
  return `EXISTS (
    SELECT 1
    FROM expenses e
    JOIN claim_period_locks l
      ON l.owner_id = e.owner_id
     AND l.period = substr(e.service_date, 1, 7)
    WHERE e.owner_id = ${row}.owner_id
      AND e.id = ${row}.expense_id
  )`;
}

const receiptTriggers = [
  `CREATE TRIGGER IF NOT EXISTS receipts_claim_lock_insert
   BEFORE INSERT ON receipts
   WHEN ${receiptLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS receipts_claim_lock_update
   BEFORE UPDATE ON receipts
   WHEN ${receiptLocked("OLD")} OR ${receiptLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS receipts_claim_lock_delete
   BEFORE DELETE ON receipts
   WHEN ${receiptLocked("OLD")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
];

function tripLocked(row: "OLD" | "NEW") {
  return `EXISTS (
    SELECT 1
    FROM trip_days d
    JOIN claim_period_locks l
      ON l.owner_id = d.owner_id
     AND l.period = substr(d.date, 1, 7)
    WHERE d.owner_id = ${row}.owner_id
      AND d.trip_id = ${row}.id
  )`;
}

const tripTriggers = [
  `CREATE TRIGGER IF NOT EXISTS trips_claim_lock_update
   BEFORE UPDATE ON trips
   WHEN ${tripLocked("OLD")} OR ${tripLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS trips_claim_lock_delete
   BEFORE DELETE ON trips
   WHEN ${tripLocked("OLD")}
  BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
];

function tripLegLocked(row: "OLD" | "NEW") {
  return `EXISTS (
    SELECT 1 FROM claim_period_locks
    WHERE owner_id = ${row}.owner_id
      AND period BETWEEN substr(${row}.start_date, 1, 7)
                     AND substr(${row}.end_date, 1, 7)
  )`;
}

const tripLegTriggers = [
  `CREATE TRIGGER IF NOT EXISTS trip_legs_claim_lock_insert
   BEFORE INSERT ON trip_legs
   WHEN ${tripLegLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS trip_legs_claim_lock_update
   BEFORE UPDATE ON trip_legs
   WHEN ${tripLegLocked("OLD")} OR ${tripLegLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS trip_legs_claim_lock_delete
   BEFORE DELETE ON trip_legs
   WHEN ${tripLegLocked("OLD")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
];

function tripLegReferenced(row: "OLD" | "NEW") {
  return `EXISTS (
    SELECT 1 FROM expenses
    WHERE owner_id = ${row}.owner_id AND trip_leg_id = ${row}.id
  ) OR EXISTS (
    SELECT 1 FROM receipt_intakes
    WHERE owner_id = ${row}.owner_id AND trip_leg_id = ${row}.id
  )`;
}

const tripLegEvidenceTriggers = [
  `CREATE TRIGGER IF NOT EXISTS trip_legs_evidence_update
   BEFORE UPDATE OF country_code, start_date, end_date ON trip_legs
   WHEN (
     NEW.country_code <> OLD.country_code
     OR NEW.start_date <> OLD.start_date
     OR NEW.end_date <> OLD.end_date
   ) AND (${tripLegReferenced("OLD")})
   BEGIN SELECT RAISE(ABORT, 'trip_leg_has_receipt_evidence'); END`,
  `CREATE TRIGGER IF NOT EXISTS trip_legs_evidence_delete
   BEFORE DELETE ON trip_legs
   WHEN ${tripLegReferenced("OLD")}
   BEGIN SELECT RAISE(ABORT, 'trip_leg_has_receipt_evidence'); END`,
];

function intakeLocked(row: "OLD" | "NEW") {
  return `(
    ${row}.service_date IS NULL AND EXISTS (
      SELECT 1 FROM claim_period_locks
      WHERE owner_id = ${row}.owner_id AND status = 'preparing'
    )
  ) OR (
    ${row}.service_date IS NOT NULL AND EXISTS (
      SELECT 1 FROM claim_period_locks
      WHERE owner_id = ${row}.owner_id
        AND period = substr(${row}.service_date, 1, 7)
    )
  )`;
}

const intakeTriggers = [
  `CREATE TRIGGER IF NOT EXISTS receipt_intakes_claim_lock_insert
   BEFORE INSERT ON receipt_intakes
   WHEN ${intakeLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS receipt_intakes_claim_lock_update
   BEFORE UPDATE ON receipt_intakes
   WHEN ${intakeLocked("OLD")} OR ${intakeLocked("NEW")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS receipt_intakes_claim_lock_delete
   BEFORE DELETE ON receipt_intakes
   WHEN ${intakeLocked("OLD")}
   BEGIN SELECT RAISE(ABORT, 'claim_period_locked'); END`,
];

export const claimLockSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS claim_period_locks (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'preparing'
      CHECK (status IN ('preparing', 'prepared')),
    token TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS claim_period_locks_owner_period_uidx
    ON claim_period_locks (owner_id, period)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS claim_period_locks_token_uidx
    ON claim_period_locks (token)`,
  `INSERT OR IGNORE INTO claim_period_locks
     (id, owner_id, period, status, token)
   SELECT
     'migration-' || id, owner_id, period, 'prepared', 'migration-' || id
   FROM claim_snapshots`,
  ...directPeriodTriggers("expenses", "service_date"),
  ...receiptTriggers,
  ...directPeriodTriggers("trip_days", "date"),
  ...tripLegTriggers,
  ...tripLegEvidenceTriggers,
  ...tripTriggers,
  ...intakeTriggers,
] as const;
