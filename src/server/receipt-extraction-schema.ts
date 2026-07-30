// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { EXPENSE_CATEGORIES } from "../domain/expense-categories.ts";

export const RECEIPT_FIELDS = [
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

export type ReceiptLocationCoordinates = {
  latitude: number;
  longitude: number;
  precision: "venue" | "address" | "city" | "country";
  evidence: string | null;
};

export type ReceiptExtraction = {
  merchant: string | null;
  serviceDate: string | null;
  transactionTime: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  currency: string;
  country: string;
  language?: string | null;
  minorUnitDigits?: number | null;
  translation?: {
    merchant: string | null;
    locationHint: string | null;
    businessReason: string | null;
    lineItemDescriptions: string[];
  };
  locationHint: string | null;
  locationCoordinates?: ReceiptLocationCoordinates | null;
  businessReason: string | null;
  mealContext: "breakfast" | "lunch" | "dinner" | "snack" | "mixed" | null;
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
    service_date: { type: ["string", "null"], format: "date" },
    transaction_time: {
      type: ["string", "null"],
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    receipt_total_minor: nullableInteger,
    eligible_minor: nullableInteger,
    gratuity_minor: { type: "integer", minimum: 0 },
    currency: { type: "string", pattern: "^(?:[A-Z]{3}|UNKNOWN)$" },
    country: { type: "string", pattern: "^(?:[A-Z]{2}|UNKNOWN)$" },
    language: {
      type: ["string", "null"],
      pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$",
    },
    minor_unit_digits: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 4,
    },
    english_translation: {
      type: "object",
      additionalProperties: false,
      properties: {
        merchant: nullableString,
        location_hint: nullableString,
        business_reason: nullableString,
        line_item_descriptions: {
          type: "array",
          maxItems: 100,
          items: { type: "string" },
        },
      },
      required: [
        "merchant",
        "location_hint",
        "business_reason",
        "line_item_descriptions",
      ],
    },
    location_hint: nullableString,
    location_coordinates: {
      type: "object",
      additionalProperties: false,
      properties: {
        latitude: {
          type: ["number", "null"],
          minimum: -90,
          maximum: 90,
        },
        longitude: {
          type: ["number", "null"],
          minimum: -180,
          maximum: 180,
        },
        precision: {
          type: ["string", "null"],
          enum: ["venue", "address", "city", "country", null],
        },
        evidence: nullableString,
      },
      required: ["latitude", "longitude", "precision", "evidence"],
    },
    business_reason: nullableString,
    meal_context: {
      type: ["string", "null"],
      enum: ["breakfast", "lunch", "dinner", "snack", "mixed", null],
    },
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
          total_minor: nullableSignedInteger,
          eligible: { type: ["boolean", "null"] },
          alcohol_suspected: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "description",
          "quantity",
          "total_minor",
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
        transaction_time: { type: "number", minimum: 0, maximum: 1 },
        receipt_total: { type: "number", minimum: 0, maximum: 1 },
        eligible_amount: { type: "number", minimum: 0, maximum: 1 },
        location: { type: "number", minimum: 0, maximum: 1 },
        business_reason: { type: "number", minimum: 0, maximum: 1 },
        meal_context: { type: "number", minimum: 0, maximum: 1 },
        gratuity: { type: "number", minimum: 0, maximum: 1 },
        line_items: { type: "number", minimum: 0, maximum: 1 },
        category: { type: "number", minimum: 0, maximum: 1 },
      },
      required: [
        "merchant",
        "service_date",
        "transaction_time",
        "receipt_total",
        "eligible_amount",
        "location",
        "business_reason",
        "meal_context",
        "gratuity",
        "line_items",
        "category",
      ],
    },
  },
  required: [
    "merchant",
    "service_date",
    "transaction_time",
    "receipt_total_minor",
    "eligible_minor",
    "gratuity_minor",
    "currency",
    "country",
    "language",
    "minor_unit_digits",
    "english_translation",
    "location_hint",
    "location_coordinates",
    "business_reason",
    "meal_context",
    "category",
    "line_items",
    "alcohol_suspected",
    "missing_fields",
    "uncertain_fields",
    "confidence",
  ],
} as const;
