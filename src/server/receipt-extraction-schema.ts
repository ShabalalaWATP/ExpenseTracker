// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { EXPENSE_CATEGORIES } from "../domain/expense-categories.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { FOOD_STYLE_TAGS, type FoodStyleTag } from "../domain/food-style.ts";

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
  documentIndex: number;
  eligible: boolean | null;
  alcoholSuspected: boolean;
  confidence: number;
};

export type ReceiptDocument = {
  documentIndex: number;
  merchant: string | null;
  serviceDate: string | null;
  transactionTime: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  currency: string;
  country: string;
  locationHint: string | null;
  duplicateOfDocumentIndex: number | null;
  lineItemIndexes: number[];
};

export type MultiReceiptAssessment = {
  detected: boolean;
  sameMeal: boolean | null;
  confidence: number;
  reason: string | null;
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
  foodStyleTags: FoodStyleTag[];
  lineItems: ExtractedLineItem[];
  receiptDocuments: ReceiptDocument[];
  multiReceipt: MultiReceiptAssessment;
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
    food_style_tags: {
      type: "array",
      maxItems: 3,
      items: { type: "string", enum: FOOD_STYLE_TAGS },
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
          document_index: { type: "integer", minimum: 1, maximum: 10 },
          eligible: { type: ["boolean", "null"] },
          alcohol_suspected: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "description",
          "quantity",
          "total_minor",
          "document_index",
          "eligible",
          "alcohol_suspected",
          "confidence",
        ],
      },
    },
    receipt_documents: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          document_index: { type: "integer", minimum: 1, maximum: 10 },
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
          location_hint: nullableString,
          duplicate_of_document_index: {
            type: ["integer", "null"],
            minimum: 1,
            maximum: 10,
          },
          line_item_indexes: {
            type: "array",
            maxItems: 100,
            items: { type: "integer", minimum: 0, maximum: 99 },
          },
        },
        required: [
          "document_index",
          "merchant",
          "service_date",
          "transaction_time",
          "receipt_total_minor",
          "eligible_minor",
          "gratuity_minor",
          "currency",
          "country",
          "location_hint",
          "duplicate_of_document_index",
          "line_item_indexes",
        ],
      },
    },
    multi_receipt: {
      type: "object",
      additionalProperties: false,
      properties: {
        detected: { type: "boolean" },
        same_meal: { type: ["boolean", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: nullableString,
      },
      required: ["detected", "same_meal", "confidence", "reason"],
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
    "food_style_tags",
    "line_items",
    "receipt_documents",
    "multi_receipt",
    "alcohol_suspected",
    "missing_fields",
    "uncertain_fields",
    "confidence",
  ],
} as const;
