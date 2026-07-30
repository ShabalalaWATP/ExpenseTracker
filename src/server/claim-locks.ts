import { database, ensureSchema } from "./db";
import { ApiError } from "./http";

async function lockedPeriods(ownerId: string): Promise<Set<string>> {
  await ensureSchema();
  const rows = await database()
    .prepare(
      `SELECT period FROM claim_snapshots WHERE owner_id = ?
       UNION
       SELECT period FROM claim_period_locks WHERE owner_id = ?`,
    )
    .bind(ownerId, ownerId)
    .all<{ period: string }>();
  return new Set(rows.results.map((row) => row.period));
}

export async function acquireClaimPeriodLock(
  ownerId: string,
  period: string,
): Promise<string> {
  await ensureSchema();
  const db = database();
  await db
    .prepare(
      `DELETE FROM claim_period_locks
       WHERE owner_id = ? AND period = ? AND status = 'preparing'
         AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes')
         AND NOT EXISTS (
           SELECT 1 FROM claim_snapshots
           WHERE owner_id = ? AND period = ?
         )`,
    )
    .bind(ownerId, period, ownerId, period)
    .run();
  const existing = await db
    .prepare(
      "SELECT status FROM claim_period_locks WHERE owner_id = ? AND period = ?",
    )
    .bind(ownerId, period)
    .first<{ status: string }>();
  if (existing) {
    throw new ApiError(
      409,
      existing.status === "prepared" ? "claim_exists" : "claim_preparing",
      existing.status === "prepared"
        ? `The ${period} claim has already been prepared.`
        : `The ${period} claim is already being prepared.`,
    );
  }
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  let result: D1Result;
  try {
    result = await db
      .prepare(
        `INSERT INTO claim_period_locks
          (id, owner_id, period, status, token)
         SELECT ?, ?, ?, 'preparing', ?
         WHERE NOT EXISTS (
           SELECT 1 FROM receipt_intakes
           WHERE owner_id = ?
             AND status = 'analysing'
             AND (service_date IS NULL OR substr(service_date, 1, 7) = ?)
         )`,
      )
      .bind(id, ownerId, period, token, ownerId, period)
      .run();
  } catch {
    throw new ApiError(
      409,
      "claim_preparing",
      `The ${period} claim is already being prepared.`,
    );
  }
  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      409,
      "receipt_intake_in_progress",
      "A receipt is being updated. Try preparing the claim again.",
    );
  }
  return token;
}

export async function finaliseClaimPeriodLock(
  ownerId: string,
  period: string,
  token: string,
): Promise<void> {
  await database()
    .prepare(
      `UPDATE claim_period_locks
       SET status = 'prepared',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND period = ? AND token = ?`,
    )
    .bind(ownerId, period, token)
    .run();
}

export async function releaseClaimPeriodLock(
  ownerId: string,
  period: string,
  token: string,
): Promise<void> {
  await database()
    .prepare(
      `DELETE FROM claim_period_locks
       WHERE owner_id = ? AND period = ? AND token = ? AND status = 'preparing'
         AND NOT EXISTS (
           SELECT 1 FROM claim_snapshots
           WHERE owner_id = ? AND period = ?
         )`,
    )
    .bind(ownerId, period, token, ownerId, period)
    .run();
}

export async function assertDateUnlocked(
  ownerId: string,
  date: string,
): Promise<void> {
  if ((await lockedPeriods(ownerId)).has(date.slice(0, 7))) {
    throw new ApiError(
      409,
      "claim_locked",
      "This claim period is prepared and its records are frozen.",
    );
  }
}

export async function assertRangeUnlocked(
  ownerId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const periods = await lockedPeriods(ownerId);
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);
  while (cursor <= end) {
    if (periods.has(cursor.toISOString().slice(0, 7))) {
      throw new ApiError(
        409,
        "claim_locked",
        "A claim period covered by this trip is prepared and frozen.",
      );
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}
