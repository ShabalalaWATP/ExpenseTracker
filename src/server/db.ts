import { getD1 } from "@/db";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
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
  `CREATE INDEX IF NOT EXISTS trips_owner_dates_idx ON trips (owner_id, start_date, end_date)`,
  `CREATE TABLE IF NOT EXISTS trip_days (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    eligible INTEGER NOT NULL DEFAULT 1 CHECK (eligible IN (0, 1)),
    confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
    note TEXT,
    UNIQUE (owner_id, trip_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS trip_days_owner_date_idx ON trip_days (owner_id, date)`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
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
  `CREATE INDEX IF NOT EXISTS expenses_owner_date_idx ON expenses (owner_id, service_date)`,
  `CREATE INDEX IF NOT EXISTS expenses_owner_trip_idx ON expenses (owner_id, trip_id)`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
    expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (owner_id, expense_id),
    UNIQUE (object_key),
    UNIQUE (owner_id, sha256),
    UNIQUE (owner_id, idempotency_key)
  )`,
  `CREATE TABLE IF NOT EXISTS claim_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
    period TEXT NOT NULL,
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
    submitted_at TEXT,
    UNIQUE (owner_id, period)
  )`,
  `CREATE TABLE IF NOT EXISTS receipt_intakes (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
    batch_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded'
      CHECK (status IN ('uploaded', 'analysing', 'needs_review', 'ready', 'confirmed', 'failed')),
    original_name TEXT NOT NULL,
    original_object_key TEXT NOT NULL UNIQUE,
    analysis_object_key TEXT,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    merchant TEXT,
    service_date TEXT,
    receipt_total_pence INTEGER,
    eligible_pence INTEGER,
    gratuity_pence INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
    location TEXT,
    business_reason TEXT,
    meal_context TEXT,
    trip_id TEXT REFERENCES trips(id) ON DELETE SET NULL,
    line_items_json TEXT NOT NULL DEFAULT '[]',
    confidence_json TEXT NOT NULL DEFAULT '{}',
    missing_fields_json TEXT NOT NULL DEFAULT '[]',
    uncertain_fields_json TEXT NOT NULL DEFAULT '[]',
    alcohol_suspected INTEGER NOT NULL DEFAULT 0 CHECK (alcohol_suspected IN (0, 1)),
    alcohol_reviewed INTEGER NOT NULL DEFAULT 0 CHECK (alcohol_reviewed IN (0, 1)),
    extraction_json TEXT,
    clarification_json TEXT,
    ai_model TEXT,
    expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (owner_id, sha256),
    UNIQUE (owner_id, idempotency_key)
  )`,
  `CREATE INDEX IF NOT EXISTS receipt_intakes_owner_status_idx
    ON receipt_intakes (owner_id, status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS receipt_intakes_owner_batch_idx
    ON receipt_intakes (owner_id, batch_id)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    owner_id TEXT NOT NULL DEFAULT 'singleton-owner',
    actor_hash TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS audit_events_owner_created_idx
    ON audit_events (owner_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_events_owner_entity_idx
    ON audit_events (owner_id, entity_type, entity_id)`,
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
