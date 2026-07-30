// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { EXPENSE_CATEGORIES } from "../domain/expense-categories.ts";

export const RECEIPT_FIELDS = [
  "merchant",
  "service_date",
  "receipt_total",
  "eligible_amount",
  "location",
  "business_reason",
  "alcohol",
  "category",
] as const;

export type ReceiptField = (typeof RECEIPT_FIELDS)[number];

export type ExtractedLineItem = {
  description: string;
  quantity: number | null;
  totalPence: number | null;
  eligible: boolean | null;
  alcoholSuspected: boolean;
  confidence: number;
};

export type ReceiptExtraction = {
  merchant: string | null;
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  currency: "GBP" | "UNKNOWN";
  locationHint: string | null;
  category: string | null;
  lineItems: ExtractedLineItem[];
  alcoholSuspected: boolean;
  missingFields: ReceiptField[];
  uncertainFields: ReceiptField[];
  confidence: Record<string, number>;
};

const nullableString = { type: ["string", "null"] };
const nullableInteger = { type: ["integer", "null"], minimum: 0 };
const nullableSignedInteger = { type: ["integer", "null"] };

export const RECEIPT_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: nullableString,
    service_date: {
      type: ["string", "null"],
      format: "date",
    },
    receipt_total_pence: nullableInteger,
    eligible_pence: nullableInteger,
    gratuity_pence: { type: "integer", minimum: 0 },
    currency: { type: "string", enum: ["GBP", "UNKNOWN"] },
    location_hint: nullableString,
    category: {
      type: ["string", "null"],
      enum: [...EXPENSE_CATEGORIES, null],
    },
    line_items: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"], minimum: 0 },
          total_pence: nullableSignedInteger,
          eligible: { type: ["boolean", "null"] },
          alcohol_suspected: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "description",
          "quantity",
          "total_pence",
          "eligible",
          "alcohol_suspected",
          "confidence",
        ],
      },
    },
    alcohol_suspected: { type: "boolean" },
    missing_fields: {
      type: "array",
      items: { type: "string", enum: RECEIPT_FIELDS },
    },
    uncertain_fields: {
      type: "array",
      items: { type: "string", enum: RECEIPT_FIELDS },
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        merchant: { type: "number", minimum: 0, maximum: 1 },
        service_date: { type: "number", minimum: 0, maximum: 1 },
        receipt_total: { type: "number", minimum: 0, maximum: 1 },
        eligible_amount: { type: "number", minimum: 0, maximum: 1 },
        location: { type: "number", minimum: 0, maximum: 1 },
        gratuity: { type: "number", minimum: 0, maximum: 1 },
        line_items: { type: "number", minimum: 0, maximum: 1 },
        category: { type: "number", minimum: 0, maximum: 1 },
      },
      required: [
        "merchant",
        "service_date",
        "receipt_total",
        "eligible_amount",
        "location",
        "gratuity",
        "line_items",
        "category",
      ],
    },
  },
  required: [
    "merchant",
    "service_date",
    "receipt_total_pence",
    "eligible_pence",
    "gratuity_pence",
    "currency",
    "location_hint",
    "category",
    "line_items",
    "alcohol_suspected",
    "missing_fields",
    "uncertain_fields",
    "confidence",
  ],
} as const;

function isReceiptField(value: unknown): value is ReceiptField {
  return (
    typeof value === "string" &&
    (RECEIPT_FIELDS as readonly string[]).includes(value)
  );
}

function money(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;
}

function signedMoney(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

function confidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function normaliseExtraction(input: unknown): ReceiptExtraction {
  const value =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const rawItems = Array.isArray(value.line_items) ? value.line_items : [];
  const rawConfidence =
    value.confidence && typeof value.confidence === "object"
      ? (value.confidence as Record<string, unknown>)
      : {};
  return {
    merchant: optionalText(value.merchant),
    serviceDate: validDate(value.service_date),
    receiptTotalPence: money(value.receipt_total_pence),
    eligiblePence: money(value.eligible_pence),
    gratuityPence: money(value.gratuity_pence) ?? 0,
    currency: value.currency === "GBP" ? "GBP" : "UNKNOWN",
    locationHint: optionalText(value.location_hint),
    category:
      typeof value.category === "string" &&
      (EXPENSE_CATEGORIES as readonly string[]).includes(value.category)
        ? value.category
        : null,
    lineItems: rawItems.slice(0, 100).map((raw) => {
      const item =
        raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : {};
      return {
        description: optionalText(item.description) ?? "Unrecognised item",
        quantity:
          typeof item.quantity === "number" &&
          Number.isFinite(item.quantity) &&
          item.quantity >= 0
            ? item.quantity
            : null,
        totalPence: signedMoney(item.total_pence),
        eligible:
          typeof item.eligible === "boolean" ? item.eligible : null,
        alcoholSuspected: item.alcohol_suspected === true,
        confidence: confidence(item.confidence),
      };
    }),
    alcoholSuspected: value.alcohol_suspected === true,
    missingFields: Array.isArray(value.missing_fields)
      ? value.missing_fields.filter(isReceiptField)
      : [],
    uncertainFields: Array.isArray(value.uncertain_fields)
      ? value.uncertain_fields.filter(isReceiptField)
      : [],
    confidence: {
      merchant: confidence(rawConfidence.merchant),
      serviceDate: confidence(rawConfidence.service_date),
      receiptTotal: confidence(rawConfidence.receipt_total),
      eligibleAmount: confidence(rawConfidence.eligible_amount),
      location: confidence(rawConfidence.location),
      gratuity: confidence(rawConfidence.gratuity),
      lineItems: confidence(rawConfidence.line_items),
      category: confidence(rawConfidence.category),
    },
  };
}

export function clarificationQuestions(fields: readonly string[]): string[] {
  const unique = [...new Set(fields)];
  const questions: Partial<Record<ReceiptField, string>> = {
    merchant: "What was the name of the place on this receipt?",
    service_date: "What date was this purchase made?",
    receipt_total: "What was the full receipt total?",
    eligible_amount:
      "How much was for your food and non-alcoholic drink only?",
    location: "Where were you when this expense was incurred?",
    business_reason: "Why was this expense necessary for duty?",
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
