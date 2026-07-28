import { ApiError } from "./http";
import { assertRangeUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import { mapTrip, type DayRow, type TripRow } from "./models";
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

async function rowsFor(id?: string) {
  const tripsQuery = id
    ? database()
        .prepare("SELECT * FROM trips WHERE id = ? ORDER BY start_date DESC")
        .bind(id)
    : database().prepare("SELECT * FROM trips ORDER BY start_date DESC");
  const tripResult = await tripsQuery.all<TripRow>();
  if (tripResult.results.length === 0) return [];
  const dayResult = id
    ? await database()
        .prepare("SELECT * FROM trip_days WHERE trip_id = ? ORDER BY date")
        .bind(id)
        .all<DayRow>()
    : await database()
        .prepare("SELECT * FROM trip_days ORDER BY date")
        .all<DayRow>();
  return tripResult.results.map((trip) => mapTrip(trip, dayResult.results));
}

export async function listTrips() {
  await ensureSchema();
  return rowsFor();
}

export async function findTrip(id: string) {
  await ensureSchema();
  return (await rowsFor(id))[0] ?? null;
}

export async function createTrip(input: TripWrite) {
  await ensureSchema();
  await assertRangeUnlocked(input.startDate!, input.endDate!);
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
          id, name, purpose, country, start_date, end_date, aggregate_election
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
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
           (id, trip_id, date, eligible, confirmed, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          day.date,
          day.eligible ? 1 : 0,
          day.confirmed ? 1 : 0,
          day.note,
        ),
    ),
  ]);
  return (await findTrip(id))!;
}

const tripColumns: Record<Exclude<keyof TripWrite, "days">, string> = {
  name: "name",
  purpose: "purpose",
  country: "country",
  startDate: "start_date",
  endDate: "end_date",
  aggregateElection: "aggregate_election",
};

export async function updateTrip(id: string, input: TripWrite) {
  await ensureSchema();
  const existing = await findTrip(id);
  if (!existing) {
    throw new ApiError(404, "not_found", "The trip was not found.");
  }
  await assertRangeUnlocked(existing.startDate, existing.endDate);
  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  await assertRangeUnlocked(startDate, endDate);
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
           WHERE id = ?`,
        )
        .bind(
          ...entries.map(([key, value]) =>
            key === "aggregateElection" ? (value ? 1 : 0) : value,
          ),
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
             WHERE id = ?`,
          )
          .bind(id),
      );
    }
    statements.push(db.prepare("DELETE FROM trip_days WHERE trip_id = ?").bind(id));
    statements.push(
      ...days.map((day) =>
        db
          .prepare(
            `INSERT INTO trip_days
             (id, trip_id, date, eligible, confirmed, note)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            id,
            day.date,
            day.eligible ? 1 : 0,
            day.confirmed ? 1 : 0,
            day.note,
          ),
      ),
    );
  }
  await db.batch(statements);
  return (await findTrip(id))!;
}
