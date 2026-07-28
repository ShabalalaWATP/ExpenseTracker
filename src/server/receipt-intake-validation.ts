import { ApiError } from "./http";
import { validDate } from "./validation";

export type IntakeDefaults = {
  batchId: string;
  originalName: string;
  location: string | null;
  businessReason: string | null;
  tripId: string | null;
  mealContext: string | null;
};

function decoded(value: string | null, maximum: number): string | null {
  if (!value) return null;
  let clean: string;
  try {
    clean = decodeURIComponent(value).trim();
  } catch {
    throw new ApiError(400, "header_invalid", "An upload detail is invalid.");
  }
  if (!clean || clean.length > maximum || /[\u0000-\u001f]/.test(clean)) {
    throw new ApiError(400, "header_invalid", "An upload detail is invalid.");
  }
  return clean;
}

export function parseIntakeHeaders(headers: Headers): IntakeDefaults {
  const batchId = decoded(headers.get("X-Batch-Id"), 100);
  const originalName =
    decoded(headers.get("X-File-Name"), 180) ?? "receipt-image";
  if (!batchId || !/^[a-zA-Z0-9-]{8,100}$/.test(batchId)) {
    throw new ApiError(400, "batch_invalid", "The upload batch is invalid.");
  }
  const mealContext = decoded(headers.get("X-Default-Meal-Context"), 20);
  if (
    mealContext &&
    !["breakfast", "lunch", "dinner", "snack", "mixed"].includes(mealContext)
  ) {
    throw new ApiError(400, "meal_context_invalid", "The meal context is invalid.");
  }
  const tripId = decoded(headers.get("X-Default-Trip-Id"), 100);
  if (tripId && !/^[a-zA-Z0-9-]{1,100}$/.test(tripId)) {
    throw new ApiError(400, "trip_invalid", "The selected trip is invalid.");
  }
  return {
    batchId,
    originalName,
    location: decoded(headers.get("X-Default-Location"), 160),
    businessReason: decoded(headers.get("X-Default-Reason"), 300),
    tripId,
    mealContext,
  };
}

export type IntakePatch = {
  merchant?: string;
  serviceDate?: string;
  receiptTotalPence?: number;
  eligiblePence?: number;
  gratuityPence?: number;
  location?: string;
  businessReason?: string;
  mealContext?: string | null;
  tripId?: string | null;
  alcoholReviewed?: boolean;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "validation_failed", "The review details are invalid.");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "validation_failed", `${field} must be text.`);
  }
  const clean = value.trim();
  if (!clean || clean.length > maximum) {
    throw new ApiError(
      400,
      "validation_failed",
      `${field} must be between 1 and ${maximum} characters.`,
    );
  }
  return clean;
}

function pence(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ApiError(
      400,
      "validation_failed",
      `${field} must be a whole number of pence.`,
    );
  }
  return value as number;
}

export function parseIntakePatch(value: unknown): IntakePatch {
  const input = record(value);
  const result: IntakePatch = {};
  if ("merchant" in input) result.merchant = text(input.merchant, "merchant", 120);
  if ("serviceDate" in input) {
    result.serviceDate = validDate(input.serviceDate, "serviceDate");
  }
  if ("receiptTotalPence" in input) {
    result.receiptTotalPence = pence(input.receiptTotalPence, "receiptTotalPence", 1);
  }
  if ("eligiblePence" in input) {
    result.eligiblePence = pence(input.eligiblePence, "eligiblePence", 1);
  }
  if ("gratuityPence" in input) {
    result.gratuityPence = pence(input.gratuityPence, "gratuityPence");
  }
  if ("location" in input) result.location = text(input.location, "location", 160);
  if ("businessReason" in input) {
    result.businessReason = text(input.businessReason, "businessReason", 300);
  }
  if ("mealContext" in input) {
    if (input.mealContext === null || input.mealContext === "") {
      result.mealContext = null;
    } else {
      const meal = text(input.mealContext, "mealContext", 20);
      if (!["breakfast", "lunch", "dinner", "snack", "mixed"].includes(meal)) {
        throw new ApiError(400, "validation_failed", "mealContext is invalid.");
      }
      result.mealContext = meal;
    }
  }
  if ("tripId" in input) {
    result.tripId =
      input.tripId === null || input.tripId === ""
        ? null
        : text(input.tripId, "tripId", 100);
  }
  if ("alcoholReviewed" in input) {
    if (typeof input.alcoholReviewed !== "boolean") {
      throw new ApiError(
        400,
        "validation_failed",
        "alcoholReviewed must be true or false.",
      );
    }
    result.alcoholReviewed = input.alcoholReviewed;
  }
  if (Object.keys(result).length === 0) {
    throw new ApiError(400, "validation_failed", "No review fields were provided.");
  }
  return result;
}
