import { ApiError } from "./http";

export type TripLegWrite = {
  id?: string;
  sequence: number;
  countryCode: string;
  location: string;
  startDate: string;
  endDate: string;
};

function invalid(message: string): never {
  throw new ApiError(400, "validation_failed", message);
}

function legRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("Every itinerary leg must be an object.");
  }
  return value as Record<string, unknown>;
}

function legText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") {
    return invalid(`${field} must be text.`);
  }
  const clean = value.trim();
  if (!clean || clean.length > maximum) {
    return invalid(`${field} must be between 1 and ${maximum} characters.`);
  }
  return clean;
}

function legDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return invalid(`${field} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return invalid(`${field} is not a real date.`);
  }
  return value;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function canonicalCountryCode(value: string): boolean {
  try {
    const canonical = new Intl.Locale(`und-${value}`).region;
    const display = new Intl.DisplayNames(["en"], { type: "region" }).of(value);
    return Boolean(
      canonical === value &&
        display &&
        display !== value &&
        display !== "Unknown Region",
    );
  } catch {
    return false;
  }
}

export function parseTripLegs(value: unknown): TripLegWrite[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    return invalid("legs must contain between 1 and 50 itinerary legs.");
  }
  const seenIds = new Set<string>();
  return value.map((item, index) => {
    const leg = legRecord(item);
    const sequence = leg.sequence === undefined ? index : leg.sequence;
    if (!Number.isSafeInteger(sequence) || sequence !== index) {
      return invalid(
        "Each leg sequence must match its ordered position starting at zero.",
      );
    }
    let id: string | undefined;
    if (leg.id !== undefined) {
      id = legText(leg.id, `legs[${index}].id`, 100);
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(id) || seenIds.has(id)) {
        return invalid("Leg IDs must be unique valid identifiers.");
      }
      seenIds.add(id);
    }
    const startDate = legDate(leg.startDate, `legs[${index}].startDate`);
    const endDate = legDate(leg.endDate, `legs[${index}].endDate`);
    if (endDate < startDate) {
      return invalid("A leg end date cannot precede its start date.");
    }
    if (
      typeof leg.countryCode !== "string" ||
      !/^[A-Z]{2}$/.test(leg.countryCode) ||
      !canonicalCountryCode(leg.countryCode)
    ) {
      return invalid(
        `legs[${index}].countryCode must be a canonical upper-case two-letter country code.`,
      );
    }
    return {
      ...(id ? { id } : {}),
      sequence,
      countryCode: leg.countryCode,
      location: legText(leg.location, `legs[${index}].location`, 160),
      startDate,
      endDate,
    };
  });
}

export function validateTripLegCoverage(
  legs: readonly TripLegWrite[],
  startDate: string,
  endDate: string,
): void {
  if (endDate < startDate) {
    return invalid("endDate cannot precede startDate.");
  }
  if (legs.length < 1 || legs.length > 50) {
    return invalid("legs must contain between 1 and 50 itinerary legs.");
  }
  if (
    legs[0].startDate !== startDate ||
    legs[legs.length - 1].endDate !== endDate
  ) {
    return invalid("The itinerary legs must cover the complete trip date range.");
  }
  for (let index = 0; index < legs.length; index += 1) {
    const leg = legs[index];
    if (
      leg.sequence !== index ||
      leg.startDate < startDate ||
      leg.endDate > endDate ||
      leg.endDate < leg.startDate
    ) {
      return invalid(
        "Itinerary legs must be ordered and fall within the trip date range.",
      );
    }
    const previous = legs[index - 1];
    if (
      previous &&
      leg.startDate !== previous.endDate &&
      leg.startDate !== nextDate(previous.endDate)
    ) {
      return invalid(
        "Itinerary legs cannot have gaps or overlap by more than one transition date.",
      );
    }
  }
}
