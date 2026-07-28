import { database, ensureSchema } from "./db";
import { ApiError } from "./http";

async function lockedPeriods(): Promise<Set<string>> {
  await ensureSchema();
  const rows = await database()
    .prepare("SELECT period FROM claim_snapshots")
    .all<{ period: string }>();
  return new Set(rows.results.map((row) => row.period));
}

export async function assertDateUnlocked(date: string): Promise<void> {
  if ((await lockedPeriods()).has(date.slice(0, 7))) {
    throw new ApiError(
      409,
      "claim_locked",
      "This claim period is prepared and its records are frozen.",
    );
  }
}

export async function assertRangeUnlocked(
  startDate: string,
  endDate: string,
): Promise<void> {
  const periods = await lockedPeriods();
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
