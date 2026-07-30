import { ApiError } from "./http";
import {
  RECEIPT_FIELDS,
  type ReceiptField,
} from "./receipt-extraction";

const TARGETABLE_FIELDS = new Set<ReceiptField>([
  "merchant",
  "service_date",
  "receipt_total",
  "eligible_amount",
  "location",
  "alcohol",
  "category",
]);

export function parseTargetedFields(value: unknown): ReceiptField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const fields = (value as Record<string, unknown>).fields;
  if (fields === undefined) return [];
  if (!Array.isArray(fields) || fields.length > 7) {
    throw new ApiError(
      400,
      "analysis_fields_invalid",
      "Choose up to seven receipt fields to recheck.",
    );
  }
  const unique = [...new Set(fields)];
  if (
    unique.some(
      (field) =>
        typeof field !== "string" ||
        !(RECEIPT_FIELDS as readonly string[]).includes(field) ||
        !TARGETABLE_FIELDS.has(field as ReceiptField),
    )
  ) {
    throw new ApiError(
      400,
      "analysis_fields_invalid",
      "One of the requested receipt fields cannot be rechecked.",
    );
  }
  return unique as ReceiptField[];
}

export function parseImageEditsHeader(
  value: string | null,
): Record<string, number> {
  if (!value) return {};
  if (value.length > 500) {
    throw new ApiError(400, "image_edits_invalid", "Image adjustments are invalid.");
  }
  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    input = parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "image_edits_invalid", "Image adjustments are invalid.");
  }
  const limits: Record<string, [number, number]> = {
    rotation: [0, 270],
    contrast: [0.8, 1.8],
    cropTop: [0, 0.4],
    cropRight: [0, 0.4],
    cropBottom: [0, 0.4],
    cropLeft: [0, 0.4],
  };
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(input)) {
    const range = limits[key];
    if (!range || typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new ApiError(400, "image_edits_invalid", "Image adjustments are invalid.");
    }
    if (raw < range[0] || raw > range[1]) {
      throw new ApiError(400, "image_edits_invalid", "Image adjustments are out of range.");
    }
    if (key === "rotation" && ![0, 90, 180, 270].includes(raw)) {
      throw new ApiError(400, "image_edits_invalid", "Image rotation is invalid.");
    }
    result[key] = raw;
  }
  const horizontal = (result.cropLeft ?? 0) + (result.cropRight ?? 0);
  const vertical = (result.cropTop ?? 0) + (result.cropBottom ?? 0);
  if (horizontal >= 0.8 || vertical >= 0.8) {
    throw new ApiError(400, "image_edits_invalid", "The crop removes too much of the receipt.");
  }
  return result;
}
