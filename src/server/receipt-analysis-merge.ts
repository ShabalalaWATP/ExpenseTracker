import type {
  ReceiptExtraction,
  ReceiptField,
} from "./receipt-extraction";
import type { ReceiptIntakeRow } from "./receipt-intake-model";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { AUTO_CONFIRM_CONFIDENCE } from "../domain/receipt-auto-confirmation.ts";

export type Provenance = Record<string, "ai" | "owner" | "auto">;

export function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const confidenceKey: Partial<Record<ReceiptField, string>> = {
  merchant: "merchant",
  service_date: "serviceDate",
  transaction_time: "transactionTime",
  receipt_total: "receiptTotal",
  eligible_amount: "eligibleAmount",
  location: "location",
  business_reason: "businessReason",
  meal_context: "mealContext",
  category: "category",
};

export function mergedConfidence(
  row: ReceiptIntakeRow,
  extraction: ReceiptExtraction,
  targeted: Set<ReceiptField>,
): Record<string, number> {
  if (!targeted.size) return extraction.confidence;
  const merged = safeJson<Record<string, number>>(row.confidence_json, {});
  for (const field of targeted) {
    const key = confidenceKey[field];
    if (key) merged[key] = extraction.confidence[key] ?? 0;
  }
  if (targeted.has("transaction_time")) {
    merged.mealContext = extraction.confidence.mealContext ?? 0;
  }
  return merged;
}

export function mergedExtractionSnapshot(
  row: ReceiptIntakeRow,
  extraction: ReceiptExtraction,
  targeted: Set<ReceiptField>,
  overrides: Partial<ReceiptExtraction>,
): ReceiptExtraction {
  return {
    ...extraction,
    ...(targeted.size
      ? safeJson<Partial<ReceiptExtraction>>(row.extraction_json, {})
      : {}),
    ...overrides,
  };
}

export function appendAnalysisHistory(
  row: ReceiptIntakeRow,
  extraction: ReceiptExtraction,
  model: string,
  targeted: Set<ReceiptField>,
): unknown[] {
  const history = safeJson<unknown[]>(row.analysis_history_json, []);
  history.push({
    analysedAt: new Date().toISOString(),
    model,
    targetedFields: [...targeted],
    extraction: {
      merchant: extraction.merchant,
      serviceDate: extraction.serviceDate,
      transactionTime: extraction.transactionTime,
      receiptTotalPence: extraction.receiptTotalPence,
      eligiblePence: extraction.eligiblePence,
      gratuityPence: extraction.gratuityPence,
      businessReason: extraction.businessReason,
      mealContext: extraction.mealContext,
    },
  });
  return history.slice(-10);
}

function currentValue(
  row: ReceiptIntakeRow,
  field: ReceiptField | "gratuity",
): unknown {
  return {
    merchant: row.merchant,
    service_date: row.service_date,
    transaction_time: safeJson<Record<string, unknown>>(
      row.extraction_json,
      {},
    ).transactionTime ?? null,
    receipt_total: row.receipt_total_pence,
    eligible_amount: row.eligible_pence,
    location: row.location,
    business_reason: row.business_reason,
    meal_context: row.meal_context,
    alcohol: Boolean(row.alcohol_suspected),
    category: row.category,
    gratuity: row.gratuity_pence,
  }[field];
}

function extractedValue(
  extraction: ReceiptExtraction,
  field: ReceiptField | "gratuity",
): unknown {
  return {
    merchant: extraction.merchant,
    service_date: extraction.serviceDate,
    transaction_time: extraction.transactionTime,
    receipt_total: extraction.receiptTotalPence,
    eligible_amount: extraction.eligiblePence,
    location: extraction.locationHint,
    business_reason: extraction.businessReason,
    meal_context: extraction.mealContext,
    alcohol: extraction.alcoholSuspected,
    category: extraction.category,
    gratuity: extraction.gratuityPence,
  }[field];
}

export function chosen<T>(
  row: ReceiptIntakeRow,
  extraction: ReceiptExtraction,
  provenance: Provenance,
  targeted: Set<string>,
  field: ReceiptField | "gratuity",
): T {
  const current = currentValue(row, field);
  const incoming = extractedValue(extraction, field);
  const mayReplace = targeted.size
    ? targeted.has(field)
    : provenance[field] !== "owner";
  return (mayReplace && incoming !== null && incoming !== undefined
    ? incoming
    : current) as T;
}

export function confidenceIssue(
  extraction: ReceiptExtraction,
  field: ReceiptField,
): boolean {
  const confidence = {
    merchant: extraction.confidence.merchant,
    service_date: extraction.confidence.serviceDate,
    transaction_time: extraction.confidence.transactionTime,
    receipt_total: extraction.confidence.receiptTotal,
    eligible_amount: extraction.confidence.eligibleAmount,
    location: extraction.confidence.location,
    business_reason: extraction.confidence.businessReason,
    meal_context: extraction.confidence.mealContext,
    alcohol: 1,
    category: extraction.confidence.category ?? 0,
  }[field];
  const threshold = {
    merchant: AUTO_CONFIRM_CONFIDENCE.merchant,
    service_date: AUTO_CONFIRM_CONFIDENCE.serviceDate,
    transaction_time: AUTO_CONFIRM_CONFIDENCE.transactionTime,
    receipt_total: AUTO_CONFIRM_CONFIDENCE.receiptTotal,
    eligible_amount: AUTO_CONFIRM_CONFIDENCE.eligibleAmount,
    location: AUTO_CONFIRM_CONFIDENCE.location,
    business_reason: AUTO_CONFIRM_CONFIDENCE.businessReason,
    meal_context: AUTO_CONFIRM_CONFIDENCE.mealContext,
    alcohol: 1,
    category: AUTO_CONFIRM_CONFIDENCE.category,
  }[field];
  return confidence < threshold;
}

export function updateProvenance(
  existing: Provenance,
  extraction: ReceiptExtraction,
  targeted: Set<string>,
): Provenance {
  const next = { ...existing };
  const fields: Array<ReceiptField | "gratuity"> = [
    "merchant",
    "service_date",
    "transaction_time",
    "receipt_total",
    "eligible_amount",
    "location",
    "business_reason",
    "meal_context",
    "alcohol",
    "category",
    "gratuity",
  ];
  for (const field of fields) {
    const incoming = extractedValue(extraction, field);
    const mayReplace = targeted.size
      ? targeted.has(field)
      : next[field] !== "owner";
    if (mayReplace && incoming !== null && incoming !== undefined) {
      next[field] = "ai";
    }
  }
  return next;
}
