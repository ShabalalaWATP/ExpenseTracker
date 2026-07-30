import type {
  ReceiptExtraction,
  ReceiptField,
} from "./receipt-extraction";
import type { ReceiptIntakeRow } from "./receipt-intake-model";

export type Provenance = Record<string, "ai" | "owner">;

export function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function currentValue(
  row: ReceiptIntakeRow,
  field: ReceiptField | "gratuity",
): unknown {
  return {
    merchant: row.merchant,
    service_date: row.service_date,
    receipt_total: row.receipt_total_pence,
    eligible_amount: row.eligible_pence,
    location: row.location,
    business_reason: row.business_reason,
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
    receipt_total: extraction.receiptTotalPence,
    eligible_amount: extraction.eligiblePence,
    location: extraction.locationHint,
    business_reason: null,
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
    receipt_total: extraction.confidence.receiptTotal,
    eligible_amount: extraction.confidence.eligibleAmount,
    location: extraction.confidence.location,
    business_reason: 1,
    alcohol: 1,
    category: extraction.confidence.category ?? 1,
  }[field];
  const threshold =
    field === "receipt_total" || field === "eligible_amount" ? 0.82 : 0.78;
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
    "receipt_total",
    "eligible_amount",
    "location",
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
