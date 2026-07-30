import {
  DEFAULT_EXPENSE_CATEGORY,
  isExpenseCategory,
  type ExpenseCategory,
} from "@/src/domain/expense-categories";
import { isIsoCalendarMonth, ukCalendarMonth } from "@/src/domain/calendar";
import { ApiError } from "./http";

export type ExpenseWrite = {
  serviceDate?: string;
  merchant?: string;
  location?: string;
  businessReason?: string;
  receiptTotalPence?: number;
  eligiblePence?: number;
  gratuityPence?: number;
  currency?: "GBP";
  country?: "GB";
  tripId?: string | null;
  mealContext?: string | null;
  category?: ExpenseCategory;
  notes?: string | null;
};

export type DayWrite = {
  date: string;
  eligible: boolean;
  confirmed: boolean;
  note: string | null;
};

export type TripWrite = {
  name?: string;
  purpose?: string | null;
  country?: "GB";
  startDate?: string;
  endDate?: string;
  aggregateElection?: boolean;
  days?: DayWrite[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "validation_failed", "The request body is invalid.");
  }
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  field: string,
  maximum: number,
  nullable = false,
): string | null {
  if (nullable && (value === null || value === "")) return null;
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

function integer(value: unknown, field: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ApiError(
      400,
      "validation_failed",
      `${field} must be a whole number of pence.`,
    );
  }
  return value as number;
}

export function validDate(value: unknown, field = "date"): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "validation_failed", `${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "validation_failed", `${field} is not a real date.`);
  }
  return value;
}

function fixed<T extends "GBP" | "GB">(
  value: unknown,
  field: string,
  expected: T,
): T {
  if (value !== expected) {
    throw new ApiError(
      400,
      "validation_failed",
      `${field} must be ${expected}.`,
    );
  }
  return expected;
}

export function parseExpense(
  value: unknown,
  partial = false,
): ExpenseWrite {
  const input = record(value);
  const result: ExpenseWrite = {};
  const required = [
    "serviceDate",
    "merchant",
    "location",
    "businessReason",
    "receiptTotalPence",
    "eligiblePence",
  ];
  if (!partial) {
    const missing = required.filter((key) => input[key] === undefined);
    if (missing.length) {
      throw new ApiError(400, "validation_failed", `Missing ${missing.join(", ")}.`);
    }
  }
  if ("serviceDate" in input) result.serviceDate = validDate(input.serviceDate, "serviceDate");
  if ("merchant" in input) result.merchant = text(input.merchant, "merchant", 120)!;
  if ("location" in input) result.location = text(input.location, "location", 160)!;
  if ("businessReason" in input) {
    result.businessReason = text(input.businessReason, "businessReason", 300)!;
  }
  if ("receiptTotalPence" in input) {
    result.receiptTotalPence = integer(input.receiptTotalPence, "receiptTotalPence", 1);
  }
  if ("eligiblePence" in input) {
    result.eligiblePence = integer(input.eligiblePence, "eligiblePence", 1);
  }
  if ("gratuityPence" in input) {
    result.gratuityPence = integer(input.gratuityPence, "gratuityPence", 0);
  } else if (!partial) result.gratuityPence = 0;
  if ("currency" in input) result.currency = fixed(input.currency, "currency", "GBP");
  else if (!partial) result.currency = "GBP";
  if ("country" in input) result.country = fixed(input.country, "country", "GB");
  else if (!partial) result.country = "GB";
  if ("tripId" in input) {
    result.tripId =
      input.tripId === null ? null : text(input.tripId, "tripId", 100)!;
  } else if (!partial) result.tripId = null;
  if ("mealContext" in input) {
    result.mealContext = text(input.mealContext, "mealContext", 160, true);
  } else if (!partial) result.mealContext = null;
  if ("category" in input) {
    if (!isExpenseCategory(input.category)) {
      throw new ApiError(
        400,
        "validation_failed",
        "category must be food, taxi, public_transport, parking or other.",
      );
    }
    result.category = input.category;
  } else if (!partial) result.category = DEFAULT_EXPENSE_CATEGORY;
  if ("notes" in input) result.notes = text(input.notes, "notes", 1_000, true);
  else if (!partial) result.notes = null;
  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(400, "validation_failed", "No supported fields were provided.");
  }
  const receiptTotal = result.receiptTotalPence;
  const eligible = result.eligiblePence;
  const gratuity = result.gratuityPence;
  if (receiptTotal !== undefined && eligible !== undefined && eligible > receiptTotal) {
    throw new ApiError(400, "validation_failed", "eligiblePence cannot exceed receiptTotalPence.");
  }
  if (eligible !== undefined && gratuity !== undefined && gratuity > eligible) {
    throw new ApiError(400, "validation_failed", "gratuityPence cannot exceed eligiblePence.");
  }
  return result;
}

function parseDays(value: unknown): DayWrite[] {
  if (!Array.isArray(value) || value.length > 370) {
    throw new ApiError(400, "validation_failed", "days must be a valid list.");
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const day = record(item);
    const date = validDate(day.date);
    if (seen.has(date)) {
      throw new ApiError(400, "validation_failed", "Trip dates must be unique.");
    }
    seen.add(date);
    if (typeof day.eligible !== "boolean" || typeof day.confirmed !== "boolean") {
      throw new ApiError(400, "validation_failed", "Day flags must be true or false.");
    }
    return {
      date,
      eligible: day.eligible,
      confirmed: day.confirmed,
      note:
        day.note === undefined ? null : text(day.note, "day note", 300, true),
    };
  });
}

export function parseTrip(value: unknown, partial = false): TripWrite {
  const input = record(value);
  const result: TripWrite = {};
  for (const field of ["name", "startDate", "endDate"]) {
    if (!partial && input[field] === undefined) {
      throw new ApiError(400, "validation_failed", `Missing ${field}.`);
    }
  }
  if ("name" in input) result.name = text(input.name, "name", 120)!;
  if ("purpose" in input) result.purpose = text(input.purpose, "purpose", 500, true);
  else if (!partial) result.purpose = null;
  if ("country" in input) result.country = fixed(input.country, "country", "GB");
  else if (!partial) result.country = "GB";
  if ("startDate" in input) result.startDate = validDate(input.startDate, "startDate");
  if ("endDate" in input) result.endDate = validDate(input.endDate, "endDate");
  if ("aggregateElection" in input) {
    if (typeof input.aggregateElection !== "boolean") {
      throw new ApiError(400, "validation_failed", "aggregateElection must be true or false.");
    }
    result.aggregateElection = input.aggregateElection;
  } else if (!partial) result.aggregateElection = false;
  if ("days" in input) result.days = parseDays(input.days);
  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(400, "validation_failed", "No supported fields were provided.");
  }
  return result;
}

export function assertId(value: string): string {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(value)) {
    throw new ApiError(404, "not_found", "The requested record was not found.");
  }
  return value;
}

export function parsePeriod(value: unknown): string {
  const period = value === undefined ? ukCalendarMonth() : value;
  if (!isIsoCalendarMonth(period)) {
    throw new ApiError(
      400,
      "validation_failed",
      "Claim period must use a valid YYYY-MM month.",
    );
  }
  return period;
}
