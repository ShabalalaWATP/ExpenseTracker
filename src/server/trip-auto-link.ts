import { database } from "./db";
import type { Principal } from "./principal";
import {
  decideAutomaticTripLink,
  eligibleTripIdsOnDate,
  type AutomaticTripLinkResolution,
} from "../domain/trip-auto-link";

export {
  decideAutomaticTripLink,
  eligibleTripIdsOnDate,
  isExplicitTripSelectionChange,
  type AutomaticTripCandidate,
  type AutomaticTripLinkResolution,
} from "../domain/trip-auto-link";

type AutomaticTripCandidateRow = {
  id: string;
  owner_id: string;
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
    explicitlySelected: boolean;
  },
): Promise<AutomaticTripLinkResolution> {
  if (input.explicitlySelected) {
    return { status: "explicit", tripId: input.tripId };
  }
  if (!input.serviceDate) {
    return { status: "none", tripId: null };
  }
  const result = await database()
    .prepare(
      `SELECT
         t.id, t.owner_id, t.start_date, t.end_date,
         COALESCE(d.eligible, 0) AS eligible,
         COALESCE(d.confirmed, 0) AS confirmed
       FROM trips t
       LEFT JOIN trip_days d
         ON d.owner_id = t.owner_id
        AND d.trip_id = t.id
        AND d.date = ?
       WHERE t.owner_id = ?
       ORDER BY t.id`,
    )
    .bind(input.serviceDate, principal.ownerId)
    .all<AutomaticTripCandidateRow>();
  const candidates = result.results.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    startDate: row.start_date,
    endDate: row.end_date,
    eligible: Boolean(row.eligible),
    confirmed: Boolean(row.confirmed),
  }));
  return decideAutomaticTripLink(
    input,
    eligibleTripIdsOnDate(candidates, principal.ownerId, input.serviceDate),
  );
}
