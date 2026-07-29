import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  text(name).notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

const ownerId = () => text("owner_id").notNull().default("singleton-owner");

export const trips = sqliteTable(
  "trips",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    name: text().notNull(),
    purpose: text(),
    country: text().notNull().default("GB"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    aggregateElection: integer("aggregate_election", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("trips_country_gb", sql`${table.country} = 'GB'`),
    check("trips_dates_ordered", sql`${table.endDate} >= ${table.startDate}`),
    index("trips_owner_dates_idx").on(
      table.ownerId,
      table.startDate,
      table.endDate,
    ),
  ],
);

export const tripDays = sqliteTable(
  "trip_days",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    date: text().notNull(),
    eligible: integer({ mode: "boolean" }).notNull().default(true),
    confirmed: integer({ mode: "boolean" }).notNull().default(false),
    note: text(),
  },
  (table) => [
    uniqueIndex("trip_days_owner_trip_date_uidx").on(
      table.ownerId,
      table.tripId,
      table.date,
    ),
    index("trip_days_owner_date_idx").on(table.ownerId, table.date),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    serviceDate: text("service_date").notNull(),
    merchant: text().notNull(),
    location: text().notNull(),
    businessReason: text("business_reason").notNull(),
    receiptTotalPence: integer("receipt_total_pence").notNull(),
    eligiblePence: integer("eligible_pence").notNull(),
    gratuityPence: integer("gratuity_pence").notNull().default(0),
    currency: text().notNull().default("GBP"),
    country: text().notNull().default("GB"),
    tripId: text("trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    mealContext: text("meal_context"),
    notes: text(),
    deletedAt: text("deleted_at"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("expenses_receipt_total_positive", sql`${table.receiptTotalPence} > 0`),
    check(
      "expenses_eligible_valid",
      sql`${table.eligiblePence} > 0 AND ${table.eligiblePence} <= ${table.receiptTotalPence}`,
    ),
    check(
      "expenses_gratuity_valid",
      sql`${table.gratuityPence} >= 0 AND ${table.gratuityPence} <= ${table.eligiblePence}`,
    ),
    check("expenses_currency_gbp", sql`${table.currency} = 'GBP'`),
    check("expenses_country_gb", sql`${table.country} = 'GB'`),
    index("expenses_owner_date_idx").on(table.ownerId, table.serviceDate),
    index("expenses_owner_trip_idx").on(table.ownerId, table.tripId),
    index("expenses_owner_deleted_idx").on(table.ownerId, table.deletedAt),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("receipts_owner_expense_uidx").on(
      table.ownerId,
      table.expenseId,
    ),
    uniqueIndex("receipts_object_key_uidx").on(table.objectKey),
    uniqueIndex("receipts_owner_sha256_uidx").on(table.ownerId, table.sha256),
    uniqueIndex("receipts_owner_idempotency_uidx").on(
      table.ownerId,
      table.idempotencyKey,
    ),
  ],
);

export const claimSnapshots = sqliteTable(
  "claim_snapshots",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    period: text().notNull(),
    status: text().notNull().default("prepared"),
    policyVersion: text("policy_version").notNull(),
    totalSpendPence: integer("total_spend_pence").notNull(),
    totalGratuityPence: integer("total_gratuity_pence").notNull(),
    qualifyingActualPence: integer("qualifying_actual_pence").notNull(),
    allowancePence: integer("allowance_pence").notNull(),
    claimablePence: integer("claimable_pence").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    preparedAt: timestamp("prepared_at"),
    submittedAt: text("submitted_at"),
  },
  (table) => [
    uniqueIndex("claim_snapshots_owner_period_uidx").on(
      table.ownerId,
      table.period,
    ),
    check(
      "claim_snapshots_status_valid",
      sql`${table.status} IN ('prepared', 'submitted')`,
    ),
  ],
);

export const claimPeriodLocks = sqliteTable(
  "claim_period_locks",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    period: text().notNull(),
    status: text().notNull().default("preparing"),
    token: text().notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("claim_period_locks_owner_period_uidx").on(
      table.ownerId,
      table.period,
    ),
    uniqueIndex("claim_period_locks_token_uidx").on(table.token),
    check(
      "claim_period_locks_status_valid",
      sql`${table.status} IN ('preparing', 'prepared')`,
    ),
  ],
);

export const receiptIntakes = sqliteTable(
  "receipt_intakes",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    batchId: text("batch_id").notNull(),
    status: text().notNull().default("uploaded"),
    originalName: text("original_name").notNull(),
    originalObjectKey: text("original_object_key").notNull(),
    analysisObjectKey: text("analysis_object_key"),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    merchant: text(),
    serviceDate: text("service_date"),
    receiptTotalPence: integer("receipt_total_pence"),
    eligiblePence: integer("eligible_pence"),
    gratuityPence: integer("gratuity_pence").notNull().default(0),
    currency: text().notNull().default("GBP"),
    location: text(),
    businessReason: text("business_reason"),
    mealContext: text("meal_context"),
    tripId: text("trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    lineItemsJson: text("line_items_json").notNull().default("[]"),
    confidenceJson: text("confidence_json").notNull().default("{}"),
    missingFieldsJson: text("missing_fields_json").notNull().default("[]"),
    uncertainFieldsJson: text("uncertain_fields_json").notNull().default("[]"),
    alcoholSuspected: integer("alcohol_suspected", { mode: "boolean" })
      .notNull()
      .default(false),
    alcoholReviewed: integer("alcohol_reviewed", { mode: "boolean" })
      .notNull()
      .default(false),
    extractionJson: text("extraction_json"),
    clarificationJson: text("clarification_json"),
    aiModel: text("ai_model"),
    expenseId: text("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check(
      "receipt_intakes_status_valid",
      sql`${table.status} IN ('uploaded', 'analysing', 'needs_review', 'ready', 'confirmed', 'failed')`,
    ),
    check(
      "receipt_intakes_currency_gbp",
      sql`${table.currency} = 'GBP'`,
    ),
    uniqueIndex("receipt_intakes_owner_sha256_uidx").on(
      table.ownerId,
      table.sha256,
    ),
    uniqueIndex("receipt_intakes_owner_idempotency_uidx").on(
      table.ownerId,
      table.idempotencyKey,
    ),
    index("receipt_intakes_owner_status_idx").on(
      table.ownerId,
      table.status,
      table.updatedAt,
    ),
    index("receipt_intakes_owner_batch_idx").on(
      table.ownerId,
      table.batchId,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    actorHash: text("actor_hash").notNull(),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("audit_events_owner_created_idx").on(
      table.ownerId,
      table.createdAt,
    ),
    index("audit_events_owner_entity_idx").on(
      table.ownerId,
      table.entityType,
      table.entityId,
    ),
  ],
);
