import { automaticTripCalculationMethod } from "@/src/domain/trip-calculation";
import { ApiError } from "./http";
import { assertRangeUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import {
  mapTrip,
  type DayRow,
  type TripRow,
} from "./models";
import type { Principal } from "./principal";
import { auditStatement } from "./audit-repository";
import {
  validateTripLegCoverage,
  type DayWrite,
  type TripLegWrite,
  type TripWrite,
} from "./validation";
import {
  replaceTripLegStatements,
  stableTripLegs,
  tripLegRows,
} from "./trip-leg-repository";

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end && dates.length <= 370) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (dates.length === 0 || dates.length > 370) {
    throw new ApiError(400, "validation_failed", "A trip cannot exceed 370 days.");
  }
  return dates;
}

function normaliseDays(
  startDate: string,
  endDate: string,
  supplied: DayWrite[] | undefined,
  current: DayWrite[] = [],
): DayWrite[] {
  const allowed = dateRange(startDate, endDate);
  const currentByDate = new Map(current.map((day) => [day.date, day]));
  const suppliedByDate = new Map((supplied ?? []).map((day) => [day.date, day]));
  for (const day of suppliedByDate.keys()) {
    if (!allowed.includes(day)) {
      throw new ApiError(
        400,
        "validation_failed",
        "Every eligibility date must fall within the trip.",
      );
    }
  }
  return allowed.map(
    (date) =>
      suppliedByDate.get(date) ??
      currentByDate.get(date) ?? {
        date,
        eligible: true,
        confirmed: false,
        note: null,
      },
  );
}

function aggregateElection(startDate: string, endDate: string): boolean {
  return automaticTripCalculationMethod(startDate, endDate) === "aggregate";
}

async function rowsFor(principal: Principal, id?: string) {
  const tripsQuery = id
    ? database()
        .prepare(
          `SELECT * FROM trips
           WHERE owner_id = ? AND id = ?
           ORDER BY start_date DESC`,
        )
        .bind(principal.ownerId, id)
    : database()
        .prepare(
          `SELECT * FROM trips
           WHERE owner_id = ?
           ORDER BY start_date DESC`,
        )
        .bind(principal.ownerId);
  const tripResult = await tripsQuery.all<TripRow>();
  if (tripResult.results.length === 0) return [];
  const dayResult = id
    ? await database()
        .prepare(
          `SELECT * FROM trip_days
           WHERE owner_id = ? AND trip_id = ?
           ORDER BY date`,
        )
        .bind(principal.ownerId, id)
        .all<DayRow>()
    : await database()
        .prepare(
          `SELECT * FROM trip_days
           WHERE owner_id = ?
           ORDER BY date`,
        )
        .bind(principal.ownerId)
        .all<DayRow>();
  const legs = await tripLegRows(principal, id);
  return tripResult.results.map((trip) =>
    mapTrip(trip, dayResult.results, legs),
  );
}

export async function listTrips(principal: Principal) {
  await ensureSchema();
  return rowsFor(principal);
}

export async function findTrip(principal: Principal, id: string) {
  await ensureSchema();
  return (await rowsFor(principal, id))[0] ?? null;
}

export async function createTrip(principal: Principal, input: TripWrite) {
  await ensureSchema();
  await assertRangeUnlocked(
    principal.ownerId,
    input.startDate!,
    input.endDate!,
  );
  validateTripLegCoverage(input.legs!, input.startDate!, input.endDate!);
  const id = crypto.randomUUID();
  const days = normaliseDays(input.startDate!, input.endDate!, input.days);
  const db = database();
  await db.batch([
    db
      .prepare(
        `INSERT INTO trips (
          id, owner_id, name, purpose, country, start_date, end_date,
          aggregate_election
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        principal.ownerId,
        input.name,
        input.purpose,
        "GB",
        input.startDate,
        input.endDate,
        aggregateElection(input.startDate!, input.endDate!) ? 1 : 0,
      ),
    ...days.map((day) =>
      db
        .prepare(
          `INSERT INTO trip_days
           (id, owner_id, trip_id, date, eligible, confirmed, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          principal.ownerId,
          id,
          day.date,
          day.eligible ? 1 : 0,
          day.confirmed ? 1 : 0,
          day.note,
        ),
    ),
    ...input.legs!.map((leg) =>
      db
        .prepare(
          `INSERT INTO trip_legs (
             id, owner_id, trip_id, sequence, country_code, location,
             start_date, end_date
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          leg.id ?? crypto.randomUUID(),
          principal.ownerId,
          id,
          leg.sequence,
          leg.countryCode,
          leg.location,
          leg.startDate,
          leg.endDate,
        ),
    ),
    auditStatement(principal, {
      action: "trip.created",
      entityType: "trip",
      entityId: id,
    }),
  ]);
  return (await findTrip(principal, id))!;
}

const tripColumns: Record<
  Exclude<keyof TripWrite, "days" | "legs" | "aggregateElection">,
  string
> = {
  name: "name",
  purpose: "purpose",
  country: "country",
  startDate: "start_date",
  endDate: "end_date",
};

export async function updateTrip(
  principal: Principal,
  id: string,
  input: TripWrite,
) {
  await ensureSchema();
  const existing = await findTrip(principal, id);
  if (!existing) {
    throw new ApiError(404, "not_found", "The trip was not found.");
  }
  await assertRangeUnlocked(
    principal.ownerId,
    existing.startDate,
    existing.endDate,
  );
  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  await assertRangeUnlocked(principal.ownerId, startDate, endDate);
  if (endDate < startDate) {
    throw new ApiError(400, "validation_failed", "endDate cannot precede startDate.");
  }
  const nextAggregateElection = aggregateElection(startDate, endDate);
  const currentLegs: TripLegWrite[] = existing.legs.map((leg) => ({
    id: leg.id,
    sequence: leg.sequence,
    countryCode: leg.countryCode,
    location: leg.location,
    startDate: leg.startDate,
    endDate: leg.endDate,
  }));
  const legs = input.legs
    ? stableTripLegs(input.legs, currentLegs)
    : currentLegs;
  validateTripLegCoverage(legs, startDate, endDate);
  const days = normaliseDays(startDate, endDate, input.days, existing.days);
  const entries = Object.entries(input).filter(
    ([key]) =>
      key !== "days" &&
      key !== "legs" &&
      key !== "country" &&
      key !== "aggregateElection",
  ) as [
    Exclude<
      keyof TripWrite,
      "days" | "legs" | "country" | "aggregateElection"
    >,
    unknown,
  ][];
  const db = database();
  const statements: D1PreparedStatement[] = [];
  if (entries.length) {
    statements.push(
      db
        .prepare(
          `UPDATE trips SET ${entries
            .map(([key]) => `${tripColumns[key]} = ?`)
            .join(", ")},
            aggregate_election = ?,
            country = 'GB',
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE owner_id = ? AND id = ?`,
        )
        .bind(
          ...entries.map(([, value]) => value),
          nextAggregateElection ? 1 : 0,
          principal.ownerId,
          id,
      ),
    );
  } else {
    statements.push(
      db
        .prepare(
          `UPDATE trips
           SET country = 'GB',
               aggregate_election = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE owner_id = ? AND id = ?`,
        )
        .bind(nextAggregateElection ? 1 : 0, principal.ownerId, id),
    );
  }
  if (input.legs) {
    statements.push(...replaceTripLegStatements(db, principal, id, legs));
  }
  if (input.days || input.startDate || input.endDate) {
    statements.push(
      db
        .prepare(
          "DELETE FROM trip_days WHERE owner_id = ? AND trip_id = ?",
        )
        .bind(principal.ownerId, id),
    );
    statements.push(
      ...days.map((day) =>
        db
          .prepare(
            `INSERT INTO trip_days
             (id, owner_id, trip_id, date, eligible, confirmed, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            principal.ownerId,
            id,
            day.date,
            day.eligible ? 1 : 0,
            day.confirmed ? 1 : 0,
            day.note,
          ),
      ),
    );
  }
  statements.push(
    auditStatement(principal, {
      action: "trip.updated",
      entityType: "trip",
      entityId: id,
    }),
  );
  await db.batch(statements);
  return (await findTrip(principal, id))!;
}
