import { database } from "./db";
import type { Principal } from "./principal";
import {
  decideAutomaticTripLegLink,
  type AutomaticTripLegLinkResolution,
} from "../domain/trip-auto-link";

export {
  decideAutomaticTripLink,
  decideAutomaticTripLegLink,
  eligibleTripLegsOnDate,
  eligibleTripIdsOnDate,
  isExplicitTripSelectionChange,
  type AutomaticTripCandidate,
  type AutomaticTripLegCandidate,
  type AutomaticTripLegLinkResolution,
  type AutomaticTripLinkResolution,
} from "../domain/trip-auto-link";

type AutomaticTripCandidateRow = {
  trip_id: string;
  trip_leg_id: string;
  owner_id: string;
  country_code: string;
  start_date: string;
  end_date: string;
  eligible: number;
  confirmed: number;
};

export async function resolveAutomaticTripLink(
  principal: Principal,
  input: {
    serviceDate: string | null;
    tripId: string | null;
    tripLegId?: string | null;
    originalCountry?: string | null;
    explicitlySelected: boolean;
  },
): Promise<AutomaticTripLegLinkResolution> {
  if (input.explicitlySelected && !input.tripId) {
    return { status: "explicit", tripId: null, tripLegId: null };
  }
  if (!input.serviceDate) {
    return input.explicitlySelected
      ? {
          status: "invalid",
          tripId: input.tripId,
          tripLegId: input.tripLegId ?? null,
        }
      : { status: "none", tripId: null, tripLegId: null };
  }
  const result = await database()
    .prepare(
      `SELECT
         t.id AS trip_id, l.id AS trip_leg_id, t.owner_id,
         l.country_code, l.start_date, l.end_date,
         COALESCE(d.eligible, 0) AS eligible,
         COALESCE(d.confirmed, 0) AS confirmed
       FROM trips t
       JOIN trip_legs l
         ON l.owner_id = t.owner_id
        AND l.trip_id = t.id
       LEFT JOIN trip_days d
         ON d.owner_id = t.owner_id
        AND d.trip_id = t.id
        AND d.date = ?
       WHERE t.owner_id = ?
       ORDER BY t.id, l.sequence`,
    )
    .bind(input.serviceDate, principal.ownerId)
    .all<AutomaticTripCandidateRow>();
  const candidates = result.results.map((row) => ({
    tripId: row.trip_id,
    tripLegId: row.trip_leg_id,
    ownerId: row.owner_id,
    countryCode: row.country_code,
    startDate: row.start_date,
    endDate: row.end_date,
    eligible: Boolean(row.eligible),
    confirmed: Boolean(row.confirmed),
  }));
  return decideAutomaticTripLegLink(
    {
      ownerId: principal.ownerId,
      serviceDate: input.serviceDate,
      originalCountry:
        input.originalCountry && /^[A-Z]{2}$/.test(input.originalCountry)
          ? input.originalCountry
          : null,
      tripId: input.tripId,
      tripLegId: input.tripLegId ?? null,
      explicitlySelected: input.explicitlySelected,
    },
    candidates,
  );
}
