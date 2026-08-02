import type {
  MultiReceiptAssessment,
  ReceiptDocument,
} from "./receipt-extraction-schema";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
}

function money(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function date(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function time(value: unknown): string | null {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : null;
}

function code(value: unknown, pattern: RegExp, fallback: string): string {
  return typeof value === "string" && pattern.test(value) ? value : fallback;
}

export function normaliseReceiptDocuments(
  input: unknown,
  fallbackCurrency: string,
  fallbackCountry: string,
): ReceiptDocument[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 10).map((candidate, offset) => {
    const item = record(candidate);
    const documentIndex = Number.isSafeInteger(item.document_index) &&
        Number(item.document_index) >= 1 && Number(item.document_index) <= 10
      ? Number(item.document_index)
      : offset + 1;
    const duplicate = Number.isSafeInteger(item.duplicate_of_document_index) &&
        Number(item.duplicate_of_document_index) >= 1 &&
        Number(item.duplicate_of_document_index) < documentIndex
      ? Number(item.duplicate_of_document_index)
      : null;
    return {
      documentIndex,
      merchant: text(item.merchant),
      serviceDate: date(item.service_date),
      transactionTime: time(item.transaction_time),
      receiptTotalPence: money(item.receipt_total_minor),
      eligiblePence: money(item.eligible_minor),
      gratuityPence: money(item.gratuity_minor) ?? 0,
      currency: code(item.currency, /^(?:[A-Z]{3}|UNKNOWN)$/, fallbackCurrency),
      country: code(item.country, /^(?:[A-Z]{2}|UNKNOWN)$/, fallbackCountry),
      locationHint: text(item.location_hint),
      duplicateOfDocumentIndex: duplicate,
      lineItemIndexes: Array.isArray(item.line_item_indexes)
        ? item.line_item_indexes.filter(
            (index): index is number => Number.isSafeInteger(index) &&
              Number(index) >= 0 && Number(index) <= 99,
          )
        : [],
    };
  });
}

export function normaliseMultiReceipt(
  input: unknown,
  documents: readonly ReceiptDocument[],
): MultiReceiptAssessment {
  const value = record(input);
  const detected = documents.length > 1;
  let sameMeal = detected && typeof value.same_meal === "boolean"
    ? value.same_meal
    : null;
  const distinct = documents.filter(
    (document) => document.duplicateOfDocumentIndex === null,
  );
  const currencies = new Set(
    distinct.map((document) => document.currency).filter((code) => code !== "UNKNOWN"),
  );
  const dates = new Set(
    distinct.map((document) => document.serviceDate).filter(Boolean),
  );
  const incompatible = currencies.size > 1 || dates.size > 1;
  if (distinct.length === 1) sameMeal = null;
  if (sameMeal === true && incompatible) sameMeal = null;
  return {
    detected,
    sameMeal,
    confidence: typeof value.confidence === "number" &&
        Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : 0,
    reason: incompatible
      ? "The visible receipts have incompatible dates or currencies."
      : detected
        ? text(value.reason)
        : null,
  };
}

export function aggregateDistinctReceipts(
  documents: readonly ReceiptDocument[],
  sameMeal: boolean | null,
): {
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number | null;
} | null {
  if (documents.length < 2) return null;
  const distinct = documents.filter(
    (document) => document.duplicateOfDocumentIndex === null,
  );
  if (distinct.length > 1 && sameMeal !== true) return null;
  const sum = (values: Array<number | null>): number | null =>
    values.every((value) => value !== null)
      ? values.reduce<number>((total, value) => total + Number(value), 0)
      : null;
  return {
    receiptTotalPence: sum(distinct.map((document) => document.receiptTotalPence)),
    eligiblePence: sum(distinct.map((document) => document.eligiblePence)),
    gratuityPence: sum(distinct.map((document) => document.gratuityPence)),
  };
}
