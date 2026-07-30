import { ApiError } from "./http";
import { database } from "./db";
import type { TripLegRow } from "./models";
import type { Principal } from "./principal";
import type { TripLegWrite } from "./trip-leg-validation";

export async function tripLegRows(
  principal: Principal,
  tripId?: string,
): Promise<TripLegRow[]> {
  const result = tripId
    ? await database()
        .prepare(
          `SELECT * FROM trip_legs
           WHERE owner_id = ? AND trip_id = ?
           ORDER BY sequence`,
        )
        .bind(principal.ownerId, tripId)
        .all<TripLegRow>()
    : await database()
        .prepare(
          `SELECT * FROM trip_legs
           WHERE owner_id = ?
           ORDER BY trip_id, sequence`,
        )
        .bind(principal.ownerId)
        .all<TripLegRow>();
  return result.results;
}

export function stableTripLegs(
  supplied: readonly TripLegWrite[],
  current: readonly TripLegWrite[],
): TripLegWrite[] {
  const currentById = new Map(
    current.filter((leg) => leg.id).map((leg) => [leg.id!, leg]),
  );
  const used = new Set<string>();
  return supplied.map((leg, index) => {
    if (leg.id) {
      if (!currentById.has(leg.id) || used.has(leg.id)) {
        throw new ApiError(
          400,
          "validation_failed",
          "A supplied itinerary leg does not belong to this trip.",
        );
      }
      used.add(leg.id);
      return leg;
    }
    const exact = current.find(
      (candidate) =>
        !used.has(candidate.id ?? "") &&
        candidate.countryCode === leg.countryCode &&
        candidate.location === leg.location &&
        candidate.startDate === leg.startDate &&
        candidate.endDate === leg.endDate,
    );
    const reusable = exact ?? current[index];
    if (reusable?.id && !used.has(reusable.id)) {
      used.add(reusable.id);
      return { ...leg, id: reusable.id };
    }
    return { ...leg, id: crypto.randomUUID() };
  });
}

export function replaceTripLegStatements(
  db: D1Database,
  principal: Principal,
  tripId: string,
  legs: readonly TripLegWrite[],
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE trip_legs
         SET sequence = sequence + 1000
         WHERE owner_id = ? AND trip_id = ?`,
      )
      .bind(principal.ownerId, tripId),
    ...legs.map((leg) =>
      db
        .prepare(
          `INSERT INTO trip_legs (
             id, owner_id, trip_id, sequence, country_code, location,
             start_date, end_date
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             sequence = excluded.sequence,
             country_code = excluded.country_code,
             location = excluded.location,
             start_date = excluded.start_date,
             end_date = excluded.end_date,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(
          leg.id,
          principal.ownerId,
          tripId,
          leg.sequence,
          leg.countryCode,
          leg.location,
          leg.startDate,
          leg.endDate,
        ),
    ),
    db
      .prepare(
        `DELETE FROM trip_legs
         WHERE owner_id = ? AND trip_id = ?
           AND id NOT IN (${legs.map(() => "?").join(", ")})`,
      )
      .bind(principal.ownerId, tripId, ...legs.map((leg) => leg.id)),
  ];
}
