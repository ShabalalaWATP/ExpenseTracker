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

export const tripLegs = sqliteTable(
  "trip_legs",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    sequence: integer().notNull(),
    countryCode: text("country_code").notNull(),
    location: text().notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("trip_legs_sequence_valid", sql`${table.sequence} >= 0`),
    check(
      "trip_legs_country_code_valid",
      sql`length(${table.countryCode}) = 2 AND ${table.countryCode} = upper(${table.countryCode})`,
    ),
    check(
      "trip_legs_dates_ordered",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
    uniqueIndex("trip_legs_owner_trip_sequence_uidx").on(
      table.ownerId,
      table.tripId,
      table.sequence,
    ),
    index("trip_legs_owner_dates_idx").on(
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

export const exchangeRateQuotes = sqliteTable(
  "exchange_rate_quotes",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    provider: text().notNull(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull().default("GBP"),
    requestedDate: text("requested_date").notNull(),
    observationDate: text("observation_date").notNull(),
    rateNumerator: text("rate_numerator").notNull(),
    rateDenominator: text("rate_denominator").notNull(),
    rateDisplay: text("rate_display").notNull(),
    providerReference: text("provider_reference").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    check(
      "exchange_rate_quotes_base_valid",
      sql`length(${table.baseCurrency}) = 3 AND ${table.baseCurrency} = upper(${table.baseCurrency})`,
    ),
    check(
      "exchange_rate_quotes_quote_gbp",
      sql`${table.quoteCurrency} = 'GBP'`,
    ),
    uniqueIndex("exchange_rate_quotes_lookup_uidx").on(
      table.ownerId,
      table.provider,
      table.baseCurrency,
      table.quoteCurrency,
      table.requestedDate,
    ),
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
    originalCurrency: text("original_currency").notNull().default("GBP"),
    originalCountry: text("original_country").notNull().default("GB"),
    originalLanguage: text("original_language").notNull().default("und"),
    originalReceiptTotalMinor: integer("original_receipt_total_minor"),
    originalEligibleMinor: integer("original_eligible_minor"),
    originalGratuityMinor: integer("original_gratuity_minor"),
    originalMinorUnitDigits: integer("original_minor_unit_digits"),
    exchangeRateQuoteId: text("exchange_rate_quote_id"),
    translationJson: text("translation_json").notNull().default("{}"),
    conversionJson: text("conversion_json").notNull().default("{}"),
    tripId: text("trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    tripLegId: text("trip_leg_id"),
    mealContext: text("meal_context"),
    category: text().notNull().default("food"),
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
    index("expenses_owner_trip_leg_idx").on(table.ownerId, table.tripLegId),
    index("expenses_owner_fx_quote_idx").on(
      table.ownerId,
      table.exchangeRateQuoteId,
    ),
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
    originalCurrency: text("original_currency").notNull().default("UNKNOWN"),
    originalCountry: text("original_country").notNull().default("UNKNOWN"),
    originalLanguage: text("original_language").notNull().default("und"),
    originalReceiptTotalMinor: integer("original_receipt_total_minor"),
    originalEligibleMinor: integer("original_eligible_minor"),
    originalGratuityMinor: integer("original_gratuity_minor"),
    originalMinorUnitDigits: integer("original_minor_unit_digits"),
    exchangeRateQuoteId: text("exchange_rate_quote_id"),
    translationJson: text("translation_json").notNull().default("{}"),
    conversionJson: text("conversion_json").notNull().default("{}"),
    location: text(),
    businessReason: text("business_reason"),
    mealContext: text("meal_context"),
    category: text(),
    tripId: text("trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    tripLegId: text("trip_leg_id"),
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
    analysisHistoryJson: text("analysis_history_json").notNull().default("[]"),
    correctionProvenanceJson: text("correction_provenance_json")
      .notNull()
      .default("{}"),
    duplicateCandidatesJson: text("duplicate_candidates_json")
      .notNull()
      .default("[]"),
    duplicateFingerprint: text("duplicate_fingerprint"),
    duplicateReviewedFingerprint: text("duplicate_reviewed_fingerprint"),
    duplicateReviewed: integer("duplicate_reviewed", { mode: "boolean" })
      .notNull()
      .default(false),
    reconciliationReviewed: integer("reconciliation_reviewed", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    imageEditsJson: text("image_edits_json").notNull().default("{}"),
    clarificationJson: text("clarification_json"),
    aiModel: text("ai_model"),
    expenseId: text("expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    autoConfirmToken: text("auto_confirm_token"),
    autoConfirmLeaseExpiresAt: timestamp("auto_confirm_lease_expires_at"),
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
    index("receipt_intakes_owner_trip_leg_idx").on(
      table.ownerId,
      table.tripLegId,
    ),
    index("receipt_intakes_owner_fx_quote_idx").on(
      table.ownerId,
      table.exchangeRateQuoteId,
    ),
  ],
);

export const receiptAutoConfirmReservations = sqliteTable(
  "receipt_auto_confirm_reservations",
  {
    ownerId: ownerId(),
    fingerprint: text().notNull(),
    receiptIntakeId: text("receipt_intake_id")
      .notNull()
      .references(() => receiptIntakes.id, { onDelete: "cascade" }),
    leaseToken: text("lease_token").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("receipt_auto_confirm_reservations_owner_fingerprint_uidx").on(
      table.ownerId,
      table.fingerprint,
    ),
    uniqueIndex("receipt_auto_confirm_reservations_owner_intake_uidx").on(
      table.ownerId,
      table.receiptIntakeId,
    ),
  ],
);

export const receiptIntakeRevisions = sqliteTable(
  "receipt_intake_revisions",
  {
    id: text().primaryKey(),
    ownerId: ownerId(),
    receiptIntakeId: text("receipt_intake_id")
      .notNull()
      .references(() => receiptIntakes.id, { onDelete: "cascade" }),
    source: text().notNull(),
    fieldsJson: text("fields_json").notNull().default("[]"),
    beforeJson: text("before_json").notNull().default("{}"),
    afterJson: text("after_json").notNull().default("{}"),
    model: text(),
    reasonCode: text("reason_code"),
    transformJson: text("transform_json").notNull().default("{}"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("receipt_intake_revisions_owner_intake_idx").on(
      table.ownerId,
      table.receiptIntakeId,
      table.createdAt,
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
