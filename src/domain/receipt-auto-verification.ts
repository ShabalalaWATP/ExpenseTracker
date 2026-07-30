// @ts-expect-error Direct Node tests require the source extension.
import { AUTO_VERIFY_CONFIDENCE, type ReceiptAutoVerification } from "./receipt-auto-confirmation.ts";

const nullableInteger = { type: ["integer", "null"], minimum: 0 };
const confidence = { type: "number", minimum: 0, maximum: 1 };

function canonicalCurrency(value: unknown): string {
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

function canonicalCountry(value: unknown): string {
  if (value === "UNKNOWN") return "UNKNOWN";
  if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) {
    return "UNKNOWN";
  }
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" }).of(value);
    return display && display !== value && display !== "Unknown Region"
      ? value
      : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function canonicalLanguage(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

export const RECEIPT_AUTO_VERIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    service_date: { type: ["string", "null"], format: "date" },
    receipt_total_minor: nullableInteger,
    eligible_minor: nullableInteger,
    currency: { type: "string", pattern: "^(?:[A-Z]{3}|UNKNOWN)$" },
    country: { type: "string", pattern: "^(?:[A-Z]{2}|UNKNOWN)$" },
    language: {
      type: ["string", "null"],
      pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$",
    },
    english_translation: {
      type: "object",
      additionalProperties: false,
      properties: {
        merchant: { type: ["string", "null"] },
        location_hint: { type: ["string", "null"] },
        line_item_descriptions: {
          type: "array",
          maxItems: 100,
          items: { type: "string" },
        },
      },
      required: ["merchant", "location_hint", "line_item_descriptions"],
    },
    is_receipt: { type: "boolean" },
    instruction_like_text_detected: { type: "boolean" },
    evidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        service_date_visible: { type: "boolean" },
        receipt_total_visible: { type: "boolean" },
        eligible_basis_visible: { type: "boolean" },
        currency_visible: { type: "boolean" },
        country_visible: { type: "boolean" },
        merchant_or_tax_identity_visible: { type: "boolean" },
      },
      required: [
        "service_date_visible",
        "receipt_total_visible",
        "eligible_basis_visible",
        "currency_visible",
        "country_visible",
        "merchant_or_tax_identity_visible",
      ],
    },
    confidence: {
      type: "object",
      additionalProperties: false,
      properties: {
        service_date: confidence,
        receipt_total: confidence,
        eligible_amount: confidence,
        currency: confidence,
        country: confidence,
        receipt_evidence: confidence,
      },
      required: [
        "service_date",
        "receipt_total",
        "eligible_amount",
        "currency",
        "country",
        "receipt_evidence",
      ],
    },
  },
  required: [
    "service_date",
    "receipt_total_minor",
    "eligible_minor",
    "currency",
    "country",
    "language",
    "english_translation",
    "is_receipt",
    "instruction_like_text_detected",
    "evidence",
    "confidence",
  ],
} as const;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  name: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    throw new Error(`${name} has invalid fields`);
  }
}

function parseNullableInteger(value: unknown): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error("invalid verification amount");
  }
  return value as number;
}

function validIsoDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function confidenceRecord(value: unknown) {
  const input = record(value, "confidence");
  const result = {} as ReceiptAutoVerification["confidence"];
  const keys = {
    serviceDate: "service_date",
    receiptTotal: "receipt_total",
    eligibleAmount: "eligible_amount",
    currency: "currency",
    country: "country",
    receiptEvidence: "receipt_evidence",
  } as const;
  exactKeys(input, Object.values(keys), "confidence");
  for (const [target, source] of Object.entries(keys)) {
    const score = input[source];
    if (typeof score !== "number" || score < 0 || score > 1) {
      throw new Error("invalid verification confidence");
    }
    result[target as keyof typeof AUTO_VERIFY_CONFIDENCE] = score;
  }
  return result;
}

export function normaliseReceiptAutoVerification(
  value: unknown,
): ReceiptAutoVerification {
  const input = record(value, "verification");
  const evidence = record(input.evidence, "evidence");
  exactKeys(
    input,
    [
      "service_date",
      "receipt_total_minor",
      "eligible_minor",
      "currency",
      "country",
      "language",
      "english_translation",
      "is_receipt",
      "instruction_like_text_detected",
      "evidence",
      "confidence",
    ],
    "verification",
  );
  exactKeys(
    evidence,
    [
      "service_date_visible",
      "receipt_total_visible",
      "eligible_basis_visible",
      "currency_visible",
      "country_visible",
      "merchant_or_tax_identity_visible",
    ],
    "evidence",
  );
  const boolean = (key: string): boolean => {
    if (typeof evidence[key] !== "boolean") {
      throw new Error("invalid verification evidence");
    }
    return evidence[key] as boolean;
  };
  if (
    input.service_date !== null &&
    (typeof input.service_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.service_date) ||
      !validIsoDate(input.service_date))
  ) {
    throw new Error("invalid verification date");
  }
  const currency = canonicalCurrency(input.currency);
  if (currency !== input.currency) {
    throw new Error("invalid verification currency");
  }
  const country = canonicalCountry(input.country);
  if (country !== input.country) {
    throw new Error("invalid verification country");
  }
  const language =
    input.language === null ? null : canonicalLanguage(input.language);
  if (language !== input.language) throw new Error("invalid verification language");
  const translation = record(input.english_translation, "english_translation");
  exactKeys(
    translation,
    ["merchant", "location_hint", "line_item_descriptions"],
    "english_translation",
  );
  const translatedText = (key: string): string | null => {
    const value = translation[key];
    if (value === null) return null;
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("invalid verification translation");
    }
    return value.trim().slice(0, 300);
  };
  if (!Array.isArray(translation.line_item_descriptions)) {
    throw new Error("invalid verification translation");
  }
  const lineItemDescriptions = translation.line_item_descriptions.map(
    (value) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("invalid verification translation");
      }
      return value.trim().slice(0, 300);
    },
  );
  if (
    typeof input.is_receipt !== "boolean" ||
    typeof input.instruction_like_text_detected !== "boolean"
  ) {
    throw new Error("invalid verification classification");
  }
  return {
    serviceDate: input.service_date,
    receiptTotalPence: parseNullableInteger(input.receipt_total_minor),
    eligiblePence: parseNullableInteger(input.eligible_minor),
    currency,
    country,
    language,
    translation: {
      merchant: translatedText("merchant"),
      locationHint: translatedText("location_hint"),
      lineItemDescriptions,
    },
    isReceipt: input.is_receipt,
    instructionLikeTextDetected: input.instruction_like_text_detected,
    evidence: {
      serviceDateVisible: boolean("service_date_visible"),
      receiptTotalVisible: boolean("receipt_total_visible"),
      eligibleBasisVisible: boolean("eligible_basis_visible"),
      currencyVisible: boolean("currency_visible"),
      countryVisible: boolean("country_visible"),
      merchantOrTaxIdentityVisible: boolean(
        "merchant_or_tax_identity_visible",
      ),
    },
    confidence: confidenceRecord(input.confidence),
  };
}
