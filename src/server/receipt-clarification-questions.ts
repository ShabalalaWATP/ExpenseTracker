// @ts-expect-error Direct Node tests require the source extension.
import {
  RECEIPT_FIELDS,
  type ReceiptField,
} from "./receipt-extraction-schema.ts";

function isReceiptField(value: unknown): value is ReceiptField {
  return typeof value === "string" &&
    (RECEIPT_FIELDS as readonly string[]).includes(value);
}

export function clarificationQuestions(fields: readonly string[]): string[] {
  const unique = [...new Set(fields)];
  const questions: Partial<Record<ReceiptField, string>> = {
    merchant: "What was the name of the place on this receipt?",
    service_date: "What date was this purchase made?",
    transaction_time: "What time was this purchase made?",
    receipt_total: "What was the full receipt total?",
    eligible_amount:
      "How much was for your food and non-alcoholic drink only?",
    location: "Where were you when this expense was incurred?",
    business_reason: "Why was this expense necessary for duty?",
    meal_context: "Was this breakfast, lunch, an evening meal or a snack?",
    alcohol:
      "Does this receipt contain alcohol, and what amount must be excluded?",
    category:
      "What kind of expense is this: food and drink, taxi, public transport, parking, or something else?",
  };
  return unique
    .filter(isReceiptField)
    .map((field) => questions[field])
    .filter((question): question is string => Boolean(question));
}
