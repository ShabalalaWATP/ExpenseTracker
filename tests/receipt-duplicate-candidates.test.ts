import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { DUPLICATE_CANDIDATE_QUERY } from "../src/server/receipt-duplicate-query.ts";

test("heuristic duplicates exclude discarded receipt intakes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE expenses (
      id TEXT, owner_id TEXT, merchant TEXT, service_date TEXT,
      receipt_total_pence INTEGER, original_currency TEXT,
      original_receipt_total_minor INTEGER, deleted_at TEXT
    );
    CREATE TABLE receipt_intakes (
      id TEXT, owner_id TEXT, status TEXT, merchant TEXT, original_name TEXT,
      service_date TEXT, receipt_total_pence INTEGER, original_currency TEXT,
      original_receipt_total_minor INTEGER, discarded_at TEXT
    );
    INSERT INTO receipt_intakes VALUES
      ('active', 'owner-1', 'ready', 'Cafe', 'active.jpg', '2026-07-31',
       1200, 'GBP', 1200, NULL),
      ('discarded', 'owner-1', 'needs_review', 'Cafe', 'discarded.jpg',
       '2026-07-31', 1200, 'GBP', 1200, '2026-07-31T10:00:00Z');
  `);

  const rows = db.prepare(DUPLICATE_CANDIDATE_QUERY).all(
    "owner-1",
    "2026-07-31",
    "GBP",
    1200,
    "2026-07-31",
    "Cafe",
    "owner-1",
    "current",
    "2026-07-31",
    "GBP",
    1200,
    "2026-07-31",
    "Cafe",
  ) as Array<{ id: string }>;

  assert.deepEqual(rows.map((row) => row.id), ["active"]);
});
