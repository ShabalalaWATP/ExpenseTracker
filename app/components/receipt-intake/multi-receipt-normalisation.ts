import type { ReceiptDocument, ReceiptIntake } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown): number | null {
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normaliseReceiptDocuments(value: unknown): ReceiptDocument[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((candidate, offset) => {
    const item = record(candidate);
    return {
      documentIndex: integer(item.documentIndex) ?? offset + 1,
      merchant: optionalText(item.merchant),
      serviceDate: optionalText(item.serviceDate),
      transactionTime: optionalText(item.transactionTime),
      receiptTotalPence: integer(item.receiptTotalPence),
      eligiblePence: integer(item.eligiblePence),
      gratuityPence: integer(item.gratuityPence) ?? 0,
      currency: optionalText(item.currency) ?? "UNKNOWN",
      country: optionalText(item.country) ?? "UNKNOWN",
      locationHint: optionalText(item.locationHint),
      duplicateOfDocumentIndex: integer(item.duplicateOfDocumentIndex),
      lineItemIndexes: Array.isArray(item.lineItemIndexes)
        ? item.lineItemIndexes.filter(
            (index): index is number => Number.isSafeInteger(index),
          )
        : [],
    };
  });
}

export function normaliseMultiReceipt(
  value: unknown,
  documentCount: number,
): ReceiptIntake["multiReceipt"] {
  const item = record(value);
  return {
    detected: documentCount > 1,
    sameMeal: typeof item.sameMeal === "boolean" ? item.sameMeal : null,
    confidence:
      typeof item.confidence === "number" && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0,
    reason: optionalText(item.reason),
  };
}
