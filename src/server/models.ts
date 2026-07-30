import { normaliseFoodStyleTags } from "@/src/domain/food-style";

export type ReceiptRow = {
  receipt_id: string | null;
  content_type: string | null;
  byte_size: number | null;
  receipt_created_at: string | null;
};

export type ExpenseRow = ReceiptRow & {
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
  original_language: string | null;
  original_receipt_total_minor: number;
  original_eligible_minor: number;
  original_gratuity_minor: number;
  original_minor_unit_digits: number;
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
  intake_extraction_json: string | null;
  intake_line_items_json: string | null;
};

export type DayRow = {
  id: string;
  trip_id: string;
  date: string;
  eligible: number;
  confirmed: number;
  note: string | null;
};

export type TripLegRow = {
  id: string;
  trip_id: string;
  sequence: number;
  country_code: string;
  location: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

export type TripRow = {
  id: string;
  name: string;
  purpose: string | null;
  country: string;
  start_date: string;
  end_date: string;
  aggregate_election: number;
  created_at: string;
  updated_at: string;
};

export type ClaimRow = {
  id: string;
  period: string;
  status: "prepared" | "submitted";
  policy_version: string;
  total_spend_pence: number;
  total_gratuity_pence: number;
  qualifying_actual_pence: number;
  allowance_pence: number;
  claimable_pence: number;
  snapshot_json: string;
  snapshot_sha256: string;
  prepared_at: string;
  submitted_at: string | null;
};

export function mapReceipt(row: ReceiptRow, expenseId?: string) {
  if (!row.receipt_id) return null;
  return {
    id: row.receipt_id,
    contentType: row.content_type!,
    byteSize: row.byte_size!,
    createdAt: row.receipt_created_at!,
    url: expenseId
      ? `/api/expenses/${expenseId}/receipt`
      : `/api/receipts/${row.receipt_id}`,
  };
}

export function mapExpense(row: ExpenseRow) {
  const parseJson = (value: string): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  const parseArray = (value: string | null): unknown[] => {
    try {
      const parsed = JSON.parse(value ?? "[]") as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const extraction = parseJson(row.intake_extraction_json ?? "{}");
  const rawCoordinates =
    extraction.locationCoordinates &&
    typeof extraction.locationCoordinates === "object" &&
    !Array.isArray(extraction.locationCoordinates)
      ? (extraction.locationCoordinates as Record<string, unknown>)
      : null;
  const latitude = rawCoordinates?.latitude;
  const longitude = rawCoordinates?.longitude;
  const precision = rawCoordinates?.precision;
  const coordinateEvidence =
    typeof rawCoordinates?.evidence === "string"
      ? rawCoordinates.evidence.trim()
      : "";
  const locationCoordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    ["venue", "address", "city", "country"].includes(String(precision)) &&
    (!["venue", "address"].includes(String(precision)) ||
      Boolean(coordinateEvidence))
      ? {
          latitude,
          longitude,
          precision,
          evidence: coordinateEvidence || null,
        }
      : null;
  return {
    id: row.id,
    serviceDate: row.service_date,
    expenseDate: row.service_date,
    merchant: row.merchant,
    location: row.location,
    businessReason: row.business_reason,
    receiptTotalPence: row.receipt_total_pence,
    eligiblePence: row.eligible_pence,
    amountPence: row.eligible_pence,
    gratuityPence: row.gratuity_pence,
    currency: row.currency,
    country: row.country,
    originalCurrency: row.original_currency,
    originalCountry: row.original_country,
    originalLanguage: row.original_language,
    originalReceiptTotalMinor: row.original_receipt_total_minor,
    originalEligibleMinor: row.original_eligible_minor,
    originalGratuityMinor: row.original_gratuity_minor,
    originalMinorUnitDigits: row.original_minor_unit_digits,
    exchangeRateQuoteId: row.exchange_rate_quote_id,
    translation: parseJson(row.translation_json),
    conversion: parseJson(row.conversion_json),
    tripId: row.trip_id,
    tripLegId: row.trip_leg_id,
    mealContext: row.meal_context,
    category: row.category ?? "food",
    notes: row.notes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locationCoordinates,
    foodStyleTags: normaliseFoodStyleTags(extraction.foodStyleTags),
    lineItems: parseArray(row.intake_line_items_json),
    receipt: mapReceipt(row, row.id),
  };
}

export function mapTrip(
  row: TripRow,
  days: DayRow[],
  legs: TripLegRow[] = [],
) {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    country: row.country,
    startDate: row.start_date,
    endDate: row.end_date,
    aggregateElection: Boolean(row.aggregate_election),
    legs: legs
      .filter((leg) => leg.trip_id === row.id)
      .sort((left, right) => left.sequence - right.sequence)
      .map((leg) => ({
        id: leg.id,
        sequence: leg.sequence,
        countryCode: leg.country_code,
        location: leg.location,
        startDate: leg.start_date,
        endDate: leg.end_date,
        createdAt: leg.created_at,
        updatedAt: leg.updated_at,
      })),
    days: days
      .filter((day) => day.trip_id === row.id)
      .map((day) => ({
        date: day.date,
        eligible: Boolean(day.eligible),
        confirmed: Boolean(day.confirmed),
        note: day.note,
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClaim(row: ClaimRow) {
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    policyVersion: row.policy_version,
    totalSpendPence: row.total_spend_pence,
    totalGratuityPence: row.total_gratuity_pence,
    qualifyingActualPence: row.qualifying_actual_pence,
    allowancePence: row.allowance_pence,
    claimablePence: row.claimable_pence,
    preparedAt: row.prepared_at,
    submittedAt: row.submitted_at,
  };
}
