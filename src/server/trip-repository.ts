import { ApiError } from "./http";
import { assertRangeUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import { mapTrip, type DayRow, type TripRow } from "./models";
import type { Principal } from "./principal";
import { auditStatement } from "./audit-repository";
import type { DayWrite, TripWrite } from "./validation";

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

function validateElection(
  startDate: string,
  endDate: string,
  aggregateElection: boolean,
): void {
  if (
    aggregateElection &&
    dateRange(startDate, endDate).length - 1 < 2
  ) {
    throw new ApiError(
      400,
      "aggregate_not_available",
      "Aggregation is available only for trips of at least two nights.",
    );
  }
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
  return tripResult.results.map((trip) => mapTrip(trip, dayResult.results));
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
  validateElection(
    input.startDate!,
    input.endDate!,
    input.aggregateElection!,
  );
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
        input.country,
        input.startDate,
        input.endDate,
        input.aggregateElection ? 1 : 0,
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
    auditStatement(principal, {
      action: "trip.created",
      entityType: "trip",
      entityId: id,
    }),
  ]);
  return (await findTrip(principal, id))!;
}

const tripColumns: Record<Exclude<keyof TripWrite, "days">, string> = {
  name: "name",
  purpose: "purpose",
  country: "country",
  startDate: "start_date",
  endDate: "end_date",
  aggregateElection: "aggregate_election",
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
  const aggregateElection =
    input.aggregateElection ?? existing.aggregateElection;
  validateElection(startDate, endDate, aggregateElection);
  const days = normaliseDays(startDate, endDate, input.days, existing.days);
  const entries = Object.entries(input).filter(([key]) => key !== "days") as [
    Exclude<keyof TripWrite, "days">,
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
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE owner_id = ? AND id = ?`,
        )
        .bind(
          ...entries.map(([key, value]) =>
              key === "aggregateElection" ? (value ? 1 : 0) : value,
          ),
          principal.ownerId,
          id,
        ),
    );
  }
  if (input.days || input.startDate || input.endDate) {
    if (entries.length === 0) {
      statements.push(
        db
          .prepare(
            `UPDATE trips
             SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE owner_id = ? AND id = ?`,
          )
          .bind(principal.ownerId, id),
      );
    }
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
