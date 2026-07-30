import { daysBetween } from "./format";
import type { TripDraft } from "./types";

export function validateTripDraft(draft: TripDraft): string | null {
  if (
    !draft.title.trim() ||
    !draft.startDate ||
    !draft.endDate ||
    draft.endDate < draft.startDate
  ) {
    return "Enter a title and a valid itinerary.";
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
  if (!draft.eligibleDates.length || !draft.attested) {
    return "Confirm at least one eligible date and complete the eligibility attestation.";
  }
  const dates = daysBetween(draft.startDate, draft.endDate);
  if (draft.eligibleDates.some((date) => !dates.includes(date))) {
    return "Every eligible date must fall within the trip.";
  }
  if (draft.calculationMethod === "aggregate" && dates.length < 3) {
    return "Aggregation requires two nights or more. Choose the daily method for this trip.";
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
    location: legs.map((leg) => leg.location).join(", "),
    country: legs[0].countryCode,
    legs,
  };
}
