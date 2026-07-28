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

export const trips = sqliteTable(
  "trips",
  {
    id: text().primaryKey(),
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
    index("trips_dates_idx").on(table.startDate, table.endDate),
  ],
);

export const tripDays = sqliteTable(
  "trip_days",
  {
    id: text().primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    date: text().notNull(),
    eligible: integer({ mode: "boolean" }).notNull().default(true),
    confirmed: integer({ mode: "boolean" }).notNull().default(false),
    note: text(),
  },
  (table) => [
    uniqueIndex("trip_days_trip_date_uidx").on(table.tripId, table.date),
    index("trip_days_date_idx").on(table.date),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: text().primaryKey(),
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
    index("expenses_date_idx").on(table.serviceDate),
    index("expenses_trip_idx").on(table.tripId),
  ],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text().primaryKey(),
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
    uniqueIndex("receipts_expense_uidx").on(table.expenseId),
    uniqueIndex("receipts_object_key_uidx").on(table.objectKey),
    uniqueIndex("receipts_sha256_uidx").on(table.sha256),
    uniqueIndex("receipts_idempotency_uidx").on(table.idempotencyKey),
  ],
);

export const claimSnapshots = sqliteTable(
  "claim_snapshots",
  {
    id: text().primaryKey(),
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
    uniqueIndex("claim_snapshots_period_uidx").on(table.period),
    check(
      "claim_snapshots_status_valid",
      sql`${table.status} IN ('prepared', 'submitted')`,
    ),
  ],
);
