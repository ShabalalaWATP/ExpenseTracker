import {
  clarificationQuestions,
  type MultiReceiptAssessment,
  type ReceiptDocument,
  type ReceiptField,
} from "./receipt-extraction";
import {
  groupReceiptState,
  type GroupReceiptLine,
  type StoredGroupReceiptReview,
} from "../domain/group-receipt";

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
  original_currency: string;
  original_country: string;
  original_language: string | null;
  original_receipt_total_minor: number | null;
  original_eligible_minor: number | null;
  original_gratuity_minor: number;
  original_minor_unit_digits: number | null;
  exchange_rate_quote_id: string | null;
  translation_json: string;
  conversion_json: string;
  location: string | null;
  business_reason: string | null;
  meal_context: string | null;
  category: string | null;
  trip_id: string | null;
  trip_leg_id: string | null;
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
  analysis_token: string | null;
  analysis_lease_expires_at: string | null;
  analysis_previous_object_key: string | null;
  discarded_at: string | null;
  auto_confirm_token: string | null;
  auto_confirm_lease_expires_at: string | null;
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
    if (field !== "transaction_time" && field !== "meal_context") {
      unresolved.add(field);
    }
  }
  for (const field of json<ReceiptField[]>(row.uncertain_fields_json, [])) {
    if (field !== "transaction_time" && field !== "meal_context") {
      unresolved.add(field);
    }
  }
  if (Boolean(row.alcohol_suspected) && !Boolean(row.alcohol_reviewed)) {
    unresolved.add("alcohol");
  }
  return [...unresolved];
}

export function receiptGroupReview(row: ReceiptIntakeRow) {
  const clarification = json<{
    groupReceipt?: StoredGroupReceiptReview;
  }>(row.clarification_json, {});
  return groupReceiptState(
    json<GroupReceiptLine[]>(row.line_items_json, []),
    clarification.groupReceipt ?? null,
  );
}

export function publicIntake(row: ReceiptIntakeRow) {
  const unresolved = unresolvedFields(row);
  const groupReceipt = receiptGroupReview(row);
  const provenance = json<Record<string, "ai" | "owner" | "auto">>(
    row.correction_provenance_json,
    {},
  );
  const extraction = json<{
    transactionTime?: unknown;
    receiptDocuments?: ReceiptDocument[];
    multiReceipt?: MultiReceiptAssessment;
  }>(
    row.extraction_json,
    {},
  );
  const receiptDocuments = Array.isArray(extraction.receiptDocuments)
    ? extraction.receiptDocuments
    : [];
  const tripMatchStatus =
    row.error_code?.startsWith("receipt_trip_")
      ? "ambiguous"
      : provenance.trip_id === "owner"
        ? "explicit"
        : row.trip_id
          ? "automatic"
          : "none";
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
    transactionTime:
      typeof extraction.transactionTime === "string"
        ? extraction.transactionTime
        : null,
    receiptTotalPence: row.receipt_total_pence,
    eligiblePence: row.eligible_pence,
    gratuityPence: row.gratuity_pence,
    currency: row.currency,
    originalCurrency: row.original_currency,
    originalCountry: row.original_country,
    originalLanguage: row.original_language,
    originalReceiptTotalMinor: row.original_receipt_total_minor,
    originalEligibleMinor: row.original_eligible_minor,
    originalGratuityMinor: row.original_gratuity_minor,
    originalMinorUnitDigits: row.original_minor_unit_digits,
    exchangeRateQuoteId: row.exchange_rate_quote_id,
    translation: json(row.translation_json, {}),
    conversion: json(row.conversion_json, {}),
    location: row.location,
    businessReason: row.business_reason,
    mealContext: row.meal_context,
    category: row.category,
    tripId: row.trip_id,
    tripLegId: row.trip_leg_id,
    tripMatchStatus,
    tripMatchException:
      row.error_code?.startsWith("receipt_trip_")
        ? row.error_message
        : null,
    lineItems: json(row.line_items_json, []),
    receiptDocuments,
    multiReceipt: extraction.multiReceipt ?? {
      detected: false,
      sameMeal: null,
      confidence: 0,
      reason: null,
    },
    confidence: json(row.confidence_json, {}),
    missingFields: json(row.missing_fields_json, []),
    uncertainFields: json(row.uncertain_fields_json, []),
    alcoholSuspected: Boolean(row.alcohol_suspected),
    alcoholReviewed: Boolean(row.alcohol_reviewed),
    analysisHistory: json(row.analysis_history_json, []),
    correctionProvenance: provenance,
    duplicateCandidates: json(row.duplicate_candidates_json, []),
    duplicateReviewed: Boolean(row.duplicate_reviewed),
    reconciliationReviewed: Boolean(row.reconciliation_reviewed),
    imageEdits: json(row.image_edits_json, {}),
    clarificationQuestions: clarificationQuestions(unresolved),
    groupReceipt: {
      likelyShared: groupReceipt.likelyShared,
      pending: groupReceipt.pending,
      reviewed: groupReceipt.reviewed,
      decision: groupReceipt.decision,
      selectedItems: groupReceipt.selectedItems,
      selectedQuantities: groupReceipt.selectedQuantities,
      peopleCount: groupReceipt.peopleCount,
      allocationMethod: groupReceipt.allocationMethod,
      estimatedPeople: groupReceipt.estimatedPeople,
      reason: groupReceipt.reason,
    },
    aiModel: row.ai_model,
    hasAnalysisCopy: Boolean(row.analysis_object_key),
    expenseId: row.expense_id,
    errorCode: row.error_code,
    error: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
