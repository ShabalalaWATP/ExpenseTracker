import type { Expense, Trip, TripLeg } from "./types";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { normaliseFoodStyleTags } from "../../src/domain/food-style.ts";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" ? (value as RecordValue) : {};
}

function integer(value: unknown, fallback = 0): number {
  return Number.isSafeInteger(value) ? (value as number) : fallback;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

function normaliseCoordinates(value: unknown): Expense["locationCoordinates"] {
  const item = record(value);
  const latitude = item.latitude;
  const longitude = item.longitude;
  const precision = text(item.precision);
  const evidence = text(item.evidence) || null;
  return typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    ["venue", "address", "city", "country"].includes(precision) &&
    (!["venue", "address"].includes(precision) || Boolean(evidence))
    ? {
        latitude,
        longitude,
        precision: precision as NonNullable<
          Expense["locationCoordinates"]
        >["precision"],
        evidence,
      }
    : null;
}

function normaliseLineItems(value: unknown): NonNullable<Expense["lineItems"]> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((entry) => {
    const item = record(entry);
    const description = text(item.description).trim();
    if (!description) return [];
    return [{
      description,
      quantity:
        typeof item.quantity === "number" && Number.isFinite(item.quantity)
          ? item.quantity
          : null,
      totalPence: Number.isSafeInteger(item.totalPence)
        ? (item.totalPence as number)
        : null,
      eligible: typeof item.eligible === "boolean" ? item.eligible : null,
    }];
  });
}

function normaliseTranslation(value: unknown): Expense["translation"] {
  const item = record(value);
  const translation = {
    merchantEnglish: text(item.merchantEnglish ?? item.merchant) || undefined,
    locationEnglish:
      text(item.locationEnglish ?? item.locationHint) || undefined,
    summaryEnglish:
      text(item.summaryEnglish ?? item.businessReason) || undefined,
  };
  return Object.values(translation).some(Boolean) ? translation : undefined;
}

function normaliseConversion(value: unknown): Expense["conversion"] {
  const item = record(value);
  const source = text(item.source ?? item.provider);
  const status = text(item.status);
  const observationDate = text(item.observationDate);
  const rateDisplay = text(item.rateDisplay);
  const providerReference = text(item.providerReference);
  const rounding = text(item.rounding);
  return source ||
    status ||
    observationDate ||
    rateDisplay ||
    providerReference ||
    rounding
    ? {
        status,
        source,
        observationDate,
        rateDisplay,
        providerReference,
        rounding,
      }
    : undefined;
}

export function normaliseExpense(value: unknown): Expense {
  const item = record(value);
  const receipt = record(item.receipt);
  const claimable = item.claimableAmountPence ?? item.claimablePence;
  return {
    id: text(item.id),
    date: text(item.date ?? item.serviceDate ?? item.expenseDate),
    merchant: text(item.merchant, "Merchant not entered"),
    receiptTotalPence: integer(
      item.receiptTotalPence ?? item.totalPence,
      integer(item.amountPence),
    ),
    eligibleAmountPence: integer(
      item.eligibleAmountPence ?? item.eligiblePence ?? item.amountPence,
    ),
    gratuityPence: integer(item.gratuityPence),
    claimableAmountPence: Number.isSafeInteger(claimable)
      ? (claimable as number)
      : undefined,
    country: text(item.country, "GB"),
    location: text(item.location),
    reason: text(item.reason ?? item.businessReason),
    mealContext: text(item.mealContext) as Expense["mealContext"],
    category: (text(item.category) || "food") as Expense["category"],
    tripId: text(item.tripId) || undefined,
    receiptStatus:
      text(item.receiptStatus ?? item.evidenceStatus) ||
      (item.receipt ? "stored" : "missing"),
    receiptUrl: text(item.receiptUrl ?? receipt.url) || undefined,
    readiness: text(item.readiness ?? item.readinessStatus),
    submitted: Boolean(item.submitted ?? item.isSubmitted),
    locked: Boolean(item.locked ?? item.isLocked),
    deletedAt: text(item.deletedAt) || null,
    originalCurrency: text(item.originalCurrency) || undefined,
    originalCountry: text(item.originalCountry) || undefined,
    originalLanguage: text(item.originalLanguage) || undefined,
    originalReceiptTotalMinor: optionalInteger(item.originalReceiptTotalMinor),
    originalEligibleMinor: optionalInteger(item.originalEligibleMinor),
    originalGratuityMinor: optionalInteger(item.originalGratuityMinor),
    originalMinorUnitDigits: optionalInteger(item.originalMinorUnitDigits),
    translation: normaliseTranslation(item.translation),
    conversion: normaliseConversion(item.conversion),
    tripLegId: text(item.tripLegId) || undefined,
    locationCoordinates: normaliseCoordinates(item.locationCoordinates),
    foodStyleTags: normaliseFoodStyleTags(item.foodStyleTags),
    lineItems: normaliseLineItems(item.lineItems),
  };
}

function normaliseTripLeg(value: unknown, index: number): TripLeg {
  const item = record(value);
  return {
    id: text(item.id) || undefined,
    sequence: integer(item.sequence, index),
    countryCode: text(item.countryCode ?? item.country, "GB").toUpperCase(),
    location: text(item.location),
    startDate: text(item.startDate),
    endDate: text(item.endDate),
  };
}

export function normaliseTrip(value: unknown): Trip {
  const item = record(value);
  const days = Array.isArray(item.days) ? item.days : [];
  const legs = (Array.isArray(item.legs) ? item.legs : [])
    .map(normaliseTripLeg)
    .sort((a, b) => a.sequence - b.sequence);
  const fallbackLeg: TripLeg = {
    sequence: 0,
    countryCode: text(item.country, "GB").toUpperCase(),
    location: text(item.location ?? item.purpose),
    startDate: text(item.startDate),
    endDate: text(item.endDate),
  };
  const itinerary = legs.length ? legs : [fallbackLeg];
  const eligibleDays = days.map(record).filter((day) => Boolean(day.eligible));
  return {
    id: text(item.id),
    title: text(item.title ?? item.name, "Untitled trip"),
    location: text(item.location ?? item.purpose) || itinerary[0].location,
    country: text(item.country) || itinerary[0].countryCode,
    startDate: text(item.startDate) || itinerary[0].startDate,
    endDate: text(item.endDate) || itinerary.at(-1)?.endDate || "",
    legs: itinerary,
    eligibleDates: Array.isArray(item.eligibleDates)
      ? item.eligibleDates.filter(
          (date): date is string => typeof date === "string",
        )
      : eligibleDays.map((day) => text(day.date)).filter(Boolean),
    calculationMethod: Boolean(item.aggregateElection)
      ? "aggregate"
      : (text(item.calculationMethod ?? item.method) as "daily" | "aggregate") ||
        "daily",
    attested:
      Boolean(item.attested ?? item.eligibilityAttested) ||
      (eligibleDays.length > 0 &&
        eligibleDays.every((day) => Boolean(day.confirmed))),
  };
}
