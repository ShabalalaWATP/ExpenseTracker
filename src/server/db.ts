import { getD1 } from "@/db";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT,
    country TEXT NOT NULL DEFAULT 'GB' CHECK (country = 'GB'),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    aggregate_election INTEGER NOT NULL DEFAULT 0 CHECK (aggregate_election IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (end_date >= start_date)
  )`,
  `CREATE INDEX IF NOT EXISTS trips_dates_idx ON trips (start_date, end_date)`,
  `CREATE TABLE IF NOT EXISTS trip_days (
    id TEXT PRIMARY KEY NOT NULL,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    eligible INTEGER NOT NULL DEFAULT 1 CHECK (eligible IN (0, 1)),
    confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
    note TEXT,
    UNIQUE (trip_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS trip_days_date_idx ON trip_days (date)`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    service_date TEXT NOT NULL,
    merchant TEXT NOT NULL,
    location TEXT NOT NULL,
    business_reason TEXT NOT NULL,
    receipt_total_pence INTEGER NOT NULL CHECK (receipt_total_pence > 0),
    eligible_pence INTEGER NOT NULL CHECK (eligible_pence > 0 AND eligible_pence <= receipt_total_pence),
    gratuity_pence INTEGER NOT NULL DEFAULT 0 CHECK (gratuity_pence >= 0 AND gratuity_pence <= eligible_pence),
    currency TEXT NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
    country TEXT NOT NULL DEFAULT 'GB' CHECK (country = 'GB'),
    trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
    meal_context TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (service_date)`,
  `CREATE INDEX IF NOT EXISTS expenses_trip_idx ON expenses (trip_id)`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY NOT NULL,
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (expense_id),
    UNIQUE (object_key),
    UNIQUE (sha256),
    UNIQUE (idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS claim_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    period TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'submitted')),
    policy_version TEXT NOT NULL,
    total_spend_pence INTEGER NOT NULL,
    total_gratuity_pence INTEGER NOT NULL,
    qualifying_actual_pence INTEGER NOT NULL,
    allowance_pence INTEGER NOT NULL,
    claimable_pence INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    snapshot_sha256 TEXT NOT NULL,
    prepared_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    submitted_at TEXT
  )`,
] as const;

let schemaPromise: Promise<void> | null = null;

export function database(): D1Database {
  return getD1();
}

export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    const db = database();
    schemaPromise = db
      .batch(schemaStatements.map((statement) => db.prepare(statement)))
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaPromise = null;
        throw error;
      });
  }
  await schemaPromise;
}
