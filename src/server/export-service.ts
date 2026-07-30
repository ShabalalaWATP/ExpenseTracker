import { database, ensureSchema } from "./db";
import type { Principal } from "./principal";

type ExpenseExportRow = {
  id: string;
  service_date: string;
  merchant: string;
  location: string;
  business_reason: string;
  receipt_total_pence: number;
  eligible_pence: number;
  gratuity_pence: number;
  currency: string;
  country: string;
  original_currency: string;
  original_country: string;
  original_language: string;
  original_receipt_total_minor: number | null;
  original_eligible_minor: number | null;
  original_gratuity_minor: number | null;
  original_minor_unit_digits: number | null;
  exchange_rate_quote_id: string | null;
  translation_json: string;
  conversion_json: string;
  trip_id: string | null;
  trip_leg_id: string | null;
  meal_context: string | null;
  category: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  receipt_id: string | null;
  receipt_content_type: string | null;
  receipt_byte_size: number | null;
};

async function rows<T>(
  sql: string,
  principal: Principal,
): Promise<T[]> {
  const result = await database()
    .prepare(sql)
    .bind(principal.ownerId)
    .all<T>();
  return result.results;
}

export async function buildJsonExport(principal: Principal) {
  await ensureSchema();
  const [
    expenses,
    trips,
    tripLegs,
    tripDays,
    exchangeRateQuotes,
    claims,
    intakes,
    intakeRevisions,
    auditEvents,
  ] =
    await Promise.all([
      rows<ExpenseExportRow>(
        `SELECT e.id, e.service_date, e.merchant, e.location,
                e.business_reason, e.receipt_total_pence, e.eligible_pence,
                e.gratuity_pence, e.currency, e.country,
                e.original_currency, e.original_country, e.original_language,
                e.original_receipt_total_minor, e.original_eligible_minor,
                e.original_gratuity_minor, e.original_minor_unit_digits,
                e.exchange_rate_quote_id, e.translation_json, e.conversion_json,
                e.trip_id, e.trip_leg_id, e.meal_context,
                e.category, e.notes, e.deleted_at, e.created_at, e.updated_at,
                r.id AS receipt_id,
                r.content_type AS receipt_content_type,
                r.byte_size AS receipt_byte_size
         FROM expenses e
         LEFT JOIN receipts r
           ON r.owner_id = e.owner_id AND r.expense_id = e.id
         WHERE e.owner_id = ?
         ORDER BY e.service_date, e.created_at`,
        principal,
      ),
      rows(
        `SELECT id, name, purpose, country, start_date, end_date,
                aggregate_election, created_at, updated_at
         FROM trips WHERE owner_id = ? ORDER BY start_date`,
        principal,
      ),
      rows(
        `SELECT id, trip_id, sequence, country_code, location,
                start_date, end_date, created_at, updated_at
         FROM trip_legs
         WHERE owner_id = ?
         ORDER BY trip_id, sequence`,
        principal,
      ),
      rows(
        `SELECT id, trip_id, date, eligible, confirmed, note
         FROM trip_days WHERE owner_id = ? ORDER BY date`,
        principal,
      ),
      rows(
        `SELECT id, provider, base_currency, quote_currency, requested_date,
                observation_date, rate_numerator, rate_denominator,
                rate_display, provider_reference, payload_sha256, created_at
         FROM exchange_rate_quotes
         WHERE owner_id = ?
         ORDER BY requested_date, base_currency`,
        principal,
      ),
      rows(
        `SELECT id, period, status, policy_version, total_spend_pence,
                total_gratuity_pence, qualifying_actual_pence,
                allowance_pence, claimable_pence, snapshot_json,
                snapshot_sha256, prepared_at, submitted_at
         FROM claim_snapshots WHERE owner_id = ? ORDER BY period`,
        principal,
      ),
      rows(
        `SELECT id, batch_id, status, original_name, content_type, byte_size,
                merchant, service_date, receipt_total_pence, eligible_pence,
                gratuity_pence, currency, original_currency, original_country,
                original_language, original_receipt_total_minor,
                original_eligible_minor, original_gratuity_minor,
                original_minor_unit_digits, exchange_rate_quote_id,
                translation_json, conversion_json, location, business_reason,
                meal_context, category, trip_id, trip_leg_id,
                line_items_json, confidence_json, extraction_json,
                missing_fields_json, uncertain_fields_json,
                alcohol_suspected, alcohol_reviewed, ai_model, expense_id,
                analysis_history_json, correction_provenance_json,
                duplicate_candidates_json, duplicate_fingerprint,
                duplicate_reviewed_fingerprint, duplicate_reviewed,
                reconciliation_reviewed, image_edits_json,
                error_code, error_message, created_at, updated_at
         FROM receipt_intakes WHERE owner_id = ? ORDER BY created_at`,
        principal,
      ),
      rows(
        `SELECT id, receipt_intake_id, source, fields_json, before_json,
                after_json, model, reason_code, transform_json, created_at
         FROM receipt_intake_revisions
         WHERE owner_id = ?
         ORDER BY created_at`,
        principal,
      ),
      rows(
        `SELECT id, actor_hash, action, entity_type, entity_id,
                metadata_json, created_at
         FROM audit_events WHERE owner_id = ? ORDER BY created_at`,
        principal,
      ),
    ]);
  return {
    schemaVersion: 4,
    exportedAt: new Date().toISOString(),
    policyScope:
      "JSP 752 Day Subsistence in GBP, with preserved international receipt evidence",
    expenses,
    trips,
    tripLegs,
    tripDays,
    exchangeRateQuotes,
    claims,
    receiptIntakes: intakes,
    receiptIntakeRevisions: intakeRevisions,
    auditEvents,
  };
}

function minorDecimal(value: number | null, digits: number | null): string {
  if (!Number.isSafeInteger(value) || value === null) return "";
  const exponent =
    Number.isSafeInteger(digits) && digits !== null && digits >= 0 && digits <= 4
      ? digits
      : 2;
  if (exponent === 0) return String(value);
  const scale = 10 ** exponent;
  const major = Math.trunc(value / scale);
  const minor = String(Math.abs(value % scale)).padStart(exponent, "0");
  return `${major}.${minor}`;
}

function safeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export async function buildCsvExport(
  principal: Principal,
): Promise<string> {
  await ensureSchema();
  const expenses = await rows<ExpenseExportRow>(
    `SELECT e.id, e.service_date, e.merchant, e.location,
            e.business_reason, e.receipt_total_pence, e.eligible_pence,
            e.gratuity_pence, e.currency, e.country,
            e.original_currency, e.original_country, e.original_language,
            e.original_receipt_total_minor, e.original_eligible_minor,
            e.original_gratuity_minor, e.original_minor_unit_digits,
            e.exchange_rate_quote_id, e.translation_json, e.conversion_json,
            e.trip_id, e.trip_leg_id, e.meal_context,
            e.category, e.notes, e.deleted_at, e.created_at, e.updated_at,
            r.id AS receipt_id,
            r.content_type AS receipt_content_type,
            r.byte_size AS receipt_byte_size
     FROM expenses e
     LEFT JOIN receipts r
       ON r.owner_id = e.owner_id AND r.expense_id = e.id
     WHERE e.owner_id = ?
     ORDER BY e.service_date, e.created_at`,
    principal,
  );
  const headers = [
    "expense_id",
    "service_date",
    "merchant",
    "location",
    "business_reason",
    "original_country",
    "original_language",
    "original_currency",
    "original_receipt_total",
    "original_eligible",
    "original_gratuity",
    "receipt_total_gbp",
    "eligible_gbp",
    "gratuity_gbp",
    "conversion_provenance_json",
    "translation_json",
    "meal_context",
    "category",
    "trip_id",
    "trip_leg_id",
    "receipt_id",
    "deleted_at",
    "created_at",
  ];
  const lines = expenses.map((expense) =>
    [
      expense.id,
      expense.service_date,
      expense.merchant,
      expense.location,
      expense.business_reason,
      expense.original_country,
      expense.original_language,
      expense.original_currency,
      minorDecimal(
        expense.original_receipt_total_minor,
        expense.original_minor_unit_digits,
      ),
      minorDecimal(
        expense.original_eligible_minor,
        expense.original_minor_unit_digits,
      ),
      minorDecimal(
        expense.original_gratuity_minor,
        expense.original_minor_unit_digits,
      ),
      (expense.receipt_total_pence / 100).toFixed(2),
      (expense.eligible_pence / 100).toFixed(2),
      (expense.gratuity_pence / 100).toFixed(2),
      expense.conversion_json,
      expense.translation_json,
      expense.meal_context,
      expense.category,
      expense.trip_id,
      expense.trip_leg_id,
      expense.receipt_id,
      expense.deleted_at,
      expense.created_at,
    ]
      .map(safeCell)
      .join(","),
  );
  return [headers.map(safeCell).join(","), ...lines].join("\r\n");
}
