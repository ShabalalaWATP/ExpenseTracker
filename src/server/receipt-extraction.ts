// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { RECEIPT_FIELDS, type ReceiptExtraction, type ReceiptField, type ReceiptLocationCoordinates } from "./receipt-extraction-schema.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { EXPENSE_CATEGORIES } from "../domain/expense-categories.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { normaliseFoodStyleTags } from "../domain/food-style.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import {
  aggregateDistinctReceipts,
  normaliseMultiReceipt,
  normaliseReceiptDocuments,
} from "./receipt-extraction-documents.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
export { clarificationQuestions } from "./receipt-clarification-questions.ts";

// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
export {
  RECEIPT_EXTRACTION_SCHEMA,
  RECEIPT_FIELDS,
  type ExtractedLineItem,
  type MultiReceiptAssessment,
  type ReceiptDocument,
  type ReceiptExtraction,
  type ReceiptField,
  type ReceiptLocationCoordinates,
} from "./receipt-extraction-schema.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
export { FOOD_STYLE_TAGS, type FoodStyleTag } from "../domain/food-style.ts";

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

function locationCoordinates(value: unknown): ReceiptLocationCoordinates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const coordinates = value as Record<string, unknown>;
  const latitude = coordinates.latitude;
  const longitude = coordinates.longitude;
  const precision = coordinates.precision;
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !["venue", "address", "city", "country"].includes(String(precision))
  ) {
    return null;
  }
  const evidence = optionalText(coordinates.evidence);
  if ((precision === "venue" || precision === "address") && !evidence) {
    return null;
  }
  return {
    latitude,
    longitude,
    precision: precision as ReceiptLocationCoordinates["precision"],
    evidence,
  };
}

export function canonicalCurrency(value: unknown): string {
  if (value === "UNKNOWN") return "UNKNOWN";
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    return "UNKNOWN";
  }
  try {
    const supported = (
      Intl as typeof Intl & {
        supportedValuesOf?: (key: "currency") => string[];
      }
    ).supportedValuesOf?.("currency");
    if (supported && !supported.includes(value)) return "UNKNOWN";
    new Intl.NumberFormat("en", { style: "currency", currency: value });
    return value;
  } catch {
    return "UNKNOWN";
  }
}

export function canonicalCountry(value: unknown): string {
  if (value === "UNKNOWN") return "UNKNOWN";
  if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) {
    return "UNKNOWN";
  }
  try {
    const canonical = new Intl.Locale(`und-${value}`).region;
    const display = new Intl.DisplayNames(["en"], { type: "region" }).of(value);
    return canonical === value &&
        display &&
        display !== value &&
        display !== "Unknown Region"
      ? value
      : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export function canonicalLanguage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

export function currencyMinorUnitDigits(currency: string): number | null {
  if (currency === "UNKNOWN") return null;
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
    return typeof digits === "number" &&
      Number.isInteger(digits) &&
      digits >= 0 &&
      digits <= 4
      ? digits
      : null;
  } catch {
    return null;
  }
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

export function normaliseTransactionTime(value: unknown): string | null {
  return typeof value === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? value
    : null;
}

const MEAL_CONTEXTS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "mixed",
] as const;

type MealContext = (typeof MEAL_CONTEXTS)[number];

function normaliseMealContext(value: unknown): MealContext | null {
  return typeof value === "string" &&
    (MEAL_CONTEXTS as readonly string[]).includes(value)
    ? (value as MealContext)
    : null;
}

export function mealContextFromTime(
  category: string | null,
  transactionTime: string | null,
  suggested: unknown = null,
): MealContext | null {
  if (category !== "food") return null;
  if (!transactionTime) return normaliseMealContext(suggested);
  const minutes =
    Number(transactionTime.slice(0, 2)) * 60 +
    Number(transactionTime.slice(3, 5));
  if (minutes >= 5 * 60 && minutes < 11 * 60) return "breakfast";
  if (minutes >= 11 * 60 && minutes < 16 * 60) return "lunch";
  if (minutes >= 16 * 60 && minutes < 23 * 60) return "dinner";
  return "snack";
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
  const category =
    typeof value.category === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value.category)
      ? value.category
      : null;
  const transactionTime = normaliseTransactionTime(value.transaction_time);
  const currency = canonicalCurrency(value.currency);
  const rawTranslation =
    value.english_translation &&
    typeof value.english_translation === "object" &&
    !Array.isArray(value.english_translation)
      ? (value.english_translation as Record<string, unknown>)
      : {};
  const translatedDescriptions = Array.isArray(
    rawTranslation.line_item_descriptions,
  )
    ? rawTranslation.line_item_descriptions
        .slice(0, 100)
        .map(optionalText)
        .filter((item): item is string => Boolean(item))
    : [];
  const receiptDocuments = normaliseReceiptDocuments(
    value.receipt_documents,
    currency,
    canonicalCountry(value.country),
  );
  const multiReceipt = normaliseMultiReceipt(
    value.multi_receipt,
    receiptDocuments,
  );
  const aggregate = aggregateDistinctReceipts(
    receiptDocuments,
    multiReceipt.sameMeal,
  );
  const uncertainFields = Array.isArray(value.uncertain_fields)
    ? value.uncertain_fields.filter(isReceiptField)
    : [];
  if (multiReceipt.detected && multiReceipt.sameMeal !== true) {
    uncertainFields.push("receipt_total", "eligible_amount");
  }
  return {
    merchant: optionalText(value.merchant),
    serviceDate: validDate(value.service_date),
    transactionTime,
    receiptTotalPence:
      aggregate?.receiptTotalPence ??
      money(value.receipt_total_minor ?? value.receipt_total_pence),
    eligiblePence:
      aggregate?.eligiblePence ??
      money(value.eligible_minor ?? value.eligible_pence),
    gratuityPence:
      aggregate?.gratuityPence ??
      money(value.gratuity_minor ?? value.gratuity_pence) ?? 0,
    currency,
    country: canonicalCountry(value.country),
    language: canonicalLanguage(value.language) ?? "und",
    minorUnitDigits:
      currencyMinorUnitDigits(currency) ??
      (Number.isInteger(value.minor_unit_digits) &&
      Number(value.minor_unit_digits) >= 0 &&
      Number(value.minor_unit_digits) <= 4
        ? Number(value.minor_unit_digits)
        : null),
    translation: {
      merchant: optionalText(rawTranslation.merchant),
      locationHint: optionalText(rawTranslation.location_hint),
      businessReason: optionalText(rawTranslation.business_reason),
      lineItemDescriptions: translatedDescriptions,
    },
    locationHint: optionalText(value.location_hint),
    locationCoordinates: locationCoordinates(value.location_coordinates),
    businessReason: optionalText(value.business_reason),
    mealContext: mealContextFromTime(
      category,
      transactionTime,
      value.meal_context,
    ),
    category,
    foodStyleTags: normaliseFoodStyleTags(value.food_style_tags),
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
        totalPence: signedMoney(item.total_minor ?? item.total_pence),
        documentIndex:
          Number.isSafeInteger(item.document_index) &&
          Number(item.document_index) >= 1 &&
          Number(item.document_index) <= 10
            ? Number(item.document_index)
            : 1,
        eligible:
          typeof item.eligible === "boolean" ? item.eligible : null,
        alcoholSuspected: item.alcohol_suspected === true,
        confidence: confidence(item.confidence),
      };
    }),
    receiptDocuments,
    multiReceipt,
    alcoholSuspected: value.alcohol_suspected === true,
    missingFields: Array.isArray(value.missing_fields)
      ? value.missing_fields.filter(isReceiptField)
      : [],
    uncertainFields: [...new Set(uncertainFields)],
    confidence: {
      merchant: confidence(rawConfidence.merchant),
      serviceDate: confidence(rawConfidence.service_date),
      transactionTime: confidence(rawConfidence.transaction_time),
      receiptTotal: confidence(rawConfidence.receipt_total),
      eligibleAmount: confidence(rawConfidence.eligible_amount),
      location: confidence(rawConfidence.location),
      businessReason: confidence(rawConfidence.business_reason),
      mealContext: confidence(rawConfidence.meal_context),
      gratuity: confidence(rawConfidence.gratuity),
      lineItems: confidence(rawConfidence.line_items),
      category: confidence(rawConfidence.category),
    },
  };
}
