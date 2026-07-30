import type { ReceiptIntakeRow } from "./receipt-intake-model";

export function receiptExpenseMetadata(
  row: ReceiptIntakeRow,
  automatic: boolean,
) {
  const category = row.category ?? "food";
  const notes = row.ai_model
    ? automatic
      ? `Receipt details suggested by ${row.ai_model} and automatically confirmed after strict checks.`
      : `Receipt details suggested by ${row.ai_model} and confirmed by the owner.`
    : "Receipt details entered and confirmed by the owner.";
  return { category, notes };
}
