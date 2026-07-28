import { recordAudit } from "./audit-repository";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";

const DAILY_LIMITS = {
  receiptAnalysis: 100,
  realtimeSession: 30,
} as const;

export async function consumeAiQuota(
  principal: Principal,
  kind: keyof typeof DAILY_LIMITS,
  entityId: string,
): Promise<void> {
  await ensureSchema();
  const action = `ai.${kind}.attempted`;
  const row = await database()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM audit_events
       WHERE owner_id = ? AND action = ?
         AND created_at >= strftime(
           '%Y-%m-%dT%H:%M:%fZ',
           'now',
           '-1 day'
         )`,
    )
    .bind(principal.ownerId, action)
    .first<{ count: number }>();
  if ((row?.count ?? 0) >= DAILY_LIMITS[kind]) {
    throw new ApiError(
      429,
      "ai_daily_limit",
      "The private daily AI safety limit has been reached. Try again tomorrow.",
    );
  }
  await recordAudit(principal, {
    action,
    entityType: "receipt_intake",
    entityId,
  });
}
