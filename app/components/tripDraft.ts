// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { canAggregateTrip } from "../../src/domain/trip-calculation.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { daysBetween } from "./format.ts";
import type { Trip, TripDraft } from "./types";

export function emptyTripDraft(): TripDraft {
  return {
    title: "",
    location: "",
    justification: "",
    country: "GB",
    startDate: "",
    endDate: "",
    legs: [{
      sequence: 0,
      countryCode: "GB",
      location: "",
      startDate: "",
      endDate: "",
    }],
    eligibleDates: [],
    attested: false,
    calculationMethod: "daily",
  };
}

export function editableCalculationMethod(
  trip: Trip | undefined,
): TripDraft["calculationMethod"] {
  return trip?.calculationMethod === "aggregate" &&
    canAggregateTrip(
      trip.startDate,
      trip.endDate,
      trip.legs.map((leg) => leg.countryCode),
    )
    ? "aggregate"
    : "daily";
}

export function validateTripDraft(
  draft: TripDraft,
  allowPendingEligibility = false,
): string | null {
  if (
    !draft.title.trim() ||
    !draft.justification.trim() ||
    !draft.startDate ||
    !draft.endDate ||
    draft.endDate < draft.startDate
  ) {
    return "Enter a title, a short justification and a valid itinerary.";
  }
  if (
    !draft.legs.length ||
    draft.legs.some(
      (leg) =>
        !/^[A-Z]{2}$/.test(leg.countryCode) ||
        !leg.location.trim() ||
        !leg.startDate ||
        !leg.endDate ||
        leg.endDate < leg.startDate,
    )
  ) {
    return "Every itinerary leg needs a country, location and valid date range.";
  }
  if (
    draft.legs[0].startDate !== draft.startDate ||
    draft.legs.at(-1)?.endDate !== draft.endDate
  ) {
    return "The itinerary must cover the complete trip date range.";
  }
  for (let index = 1; index < draft.legs.length; index += 1) {
    const previousEnd = new Date(`${draft.legs[index - 1].endDate}T00:00:00Z`);
    previousEnd.setUTCDate(previousEnd.getUTCDate() + 1);
    const nextDay = previousEnd.toISOString().slice(0, 10);
    if (
      draft.legs[index].startDate !== draft.legs[index - 1].endDate &&
      draft.legs[index].startDate !== nextDay
    ) {
      return "Itinerary legs must be chronological without date gaps or overlaps.";
    }
  }
  const dates = daysBetween(draft.startDate, draft.endDate);
  if (draft.eligibleDates.some((date) => !dates.includes(date))) {
    return "Every eligible date must fall within the trip.";
  }
  if (
    !allowPendingEligibility &&
    (!draft.eligibleDates.length || !draft.attested)
  ) {
    return "Select and confirm the eligible dates.";
  }
  return null;
}

export function cleanTripDraft(draft: TripDraft): TripDraft {
  const legs = draft.legs.map((leg, sequence) => ({
    ...leg,
    sequence,
    countryCode: leg.countryCode.toUpperCase(),
    location: leg.location.trim(),
  }));
  return {
    ...draft,
    title: draft.title.trim(),
    justification: draft.justification.trim(),
    location: legs.map((leg) => leg.location).join(", "),
    country: legs[0].countryCode,
    legs,
    calculationMethod:
      draft.calculationMethod === "aggregate" &&
      canAggregateTrip(
        draft.startDate,
        draft.endDate,
        legs.map((leg) => leg.countryCode),
      )
        ? "aggregate"
        : "daily",
  };
}
