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
  trip_id: string | null;
  meal_context: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DayRow = {
  id: string;
  trip_id: string;
  date: string;
  eligible: number;
  confirmed: number;
  note: string | null;
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

export function mapReceipt(row: ReceiptRow) {
  if (!row.receipt_id) return null;
  return {
    id: row.receipt_id,
    contentType: row.content_type!,
    byteSize: row.byte_size!,
    createdAt: row.receipt_created_at!,
    url: `/api/receipts/${row.receipt_id}`,
  };
}

export function mapExpense(row: ExpenseRow) {
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
    tripId: row.trip_id,
    mealContext: row.meal_context,
    notes: row.notes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    receipt: mapReceipt(row),
  };
}

export function mapTrip(row: TripRow, days: DayRow[]) {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    country: row.country,
    startDate: row.start_date,
    endDate: row.end_date,
    aggregateElection: Boolean(row.aggregate_election),
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
