import { clarificationQuestions, type ReceiptField } from "./receipt-extraction";

export type ReceiptIntakeStatus =
  | "uploaded"
  | "analysing"
  | "needs_review"
  | "ready"
  | "confirmed"
  | "failed";

export type ReceiptIntakeRow = {
  id: string;
  owner_id: string;
  batch_id: string;
  status: ReceiptIntakeStatus;
  original_name: string;
  original_object_key: string;
  analysis_object_key: string | null;
  content_type: string;
  byte_size: number;
  sha256: string;
  idempotency_key: string;
  merchant: string | null;
  service_date: string | null;
  receipt_total_pence: number | null;
  eligible_pence: number | null;
  gratuity_pence: number;
  currency: string;
  location: string | null;
  business_reason: string | null;
  meal_context: string | null;
  category: string | null;
  trip_id: string | null;
  line_items_json: string;
  confidence_json: string;
  missing_fields_json: string;
  uncertain_fields_json: string;
  alcohol_suspected: number;
  alcohol_reviewed: number;
  extraction_json: string | null;
  analysis_history_json: string;
  correction_provenance_json: string;
  duplicate_candidates_json: string;
  duplicate_fingerprint: string | null;
  duplicate_reviewed_fingerprint: string | null;
  duplicate_reviewed: number;
  reconciliation_reviewed: number;
  image_edits_json: string;
  clarification_json: string | null;
  ai_model: string | null;
  expense_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function json<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function unresolvedFields(row: ReceiptIntakeRow): ReceiptField[] {
  const unresolved = new Set<ReceiptField>();
  if (!row.merchant) unresolved.add("merchant");
  if (!row.service_date) unresolved.add("service_date");
  if (row.receipt_total_pence === null) unresolved.add("receipt_total");
  if (row.eligible_pence === null) unresolved.add("eligible_amount");
  if (!row.location) unresolved.add("location");
  if (!row.business_reason) unresolved.add("business_reason");
  for (const field of json<ReceiptField[]>(row.missing_fields_json, [])) {
    unresolved.add(field);
  }
  for (const field of json<ReceiptField[]>(row.uncertain_fields_json, [])) {
    unresolved.add(field);
  }
  if (Boolean(row.alcohol_suspected) && !Boolean(row.alcohol_reviewed)) {
    unresolved.add("alcohol");
  }
  return [...unresolved];
}

export function publicIntake(row: ReceiptIntakeRow) {
  const unresolved = unresolvedFields(row);
  return {
    id: row.id,
    batchId: row.batch_id,
    status: row.status,
    originalName: row.original_name,
    contentType: row.content_type,
    byteSize: row.byte_size,
    previewUrl: `/api/receipt-intakes/${row.id}/image`,
    merchant: row.merchant,
    serviceDate: row.service_date,
    receiptTotalPence: row.receipt_total_pence,
    eligiblePence: row.eligible_pence,
    gratuityPence: row.gratuity_pence,
    currency: row.currency,
    location: row.location,
    businessReason: row.business_reason,
    mealContext: row.meal_context,
    category: row.category,
    tripId: row.trip_id,
    lineItems: json(row.line_items_json, []),
    confidence: json(row.confidence_json, {}),
    missingFields: json(row.missing_fields_json, []),
    uncertainFields: json(row.uncertain_fields_json, []),
    alcoholSuspected: Boolean(row.alcohol_suspected),
    alcoholReviewed: Boolean(row.alcohol_reviewed),
    analysisHistory: json(row.analysis_history_json, []),
    correctionProvenance: json(row.correction_provenance_json, {}),
    duplicateCandidates: json(row.duplicate_candidates_json, []),
    duplicateReviewed: Boolean(row.duplicate_reviewed),
    reconciliationReviewed: Boolean(row.reconciliation_reviewed),
    imageEdits: json(row.image_edits_json, {}),
    clarificationQuestions: clarificationQuestions(unresolved),
    aiModel: row.ai_model,
    hasAnalysisCopy: Boolean(row.analysis_object_key),
    expenseId: row.expense_id,
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
