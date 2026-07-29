import { apiRequest } from "./api";
import { daysBetween } from "./format";
import type { TripDraft } from "./types";

function tripBody(draft: TripDraft) {
  return {
    name: draft.title,
    purpose: draft.location,
    country: "GB",
    startDate: draft.startDate,
    endDate: draft.endDate,
    aggregateElection: draft.calculationMethod === "aggregate",
    days: daysBetween(draft.startDate, draft.endDate).map((date) => ({
      date,
      eligible: draft.eligibleDates.includes(date),
      confirmed: draft.eligibleDates.includes(date) && draft.attested,
    })),
  };
}

export async function createTrip(draft: TripDraft): Promise<void> {
  await apiRequest("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tripBody(draft)),
  });
}

export async function updateTrip(
  id: string,
  draft: TripDraft,
): Promise<void> {
  await apiRequest(`/api/trips/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tripBody(draft)),
  });
}
