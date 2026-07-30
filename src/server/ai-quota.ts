import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";

const DAILY_LIMITS = {
  receiptAnalysis: 100,
  realtimeSession: 30,
  policyQuestion: 60,
} as const;

const ENTITY_TYPES: Record<keyof typeof DAILY_LIMITS, string> = {
  receiptAnalysis: "receipt_intake",
  realtimeSession: "ai_session",
  policyQuestion: "policy_question",
};

export async function consumeAiQuota(
  principal: Principal,
  kind: keyof typeof DAILY_LIMITS,
  entityId: string,
): Promise<void> {
  await ensureSchema();
  const action = `ai.${kind}.attempted`;
  const result = await database()
    .prepare(
      `INSERT INTO audit_events (
        id, owner_id, actor_hash, action, entity_type, entity_id, metadata_json
      )
      SELECT ?, ?, ?, ?, ?, ?, '{}'
      WHERE (
        SELECT COUNT(*)
        FROM audit_events
        WHERE owner_id = ? AND action = ?
          AND created_at >= strftime(
            '%Y-%m-%dT%H:%M:%fZ',
            'now',
            '-1 day'
          )
      ) < ?`,
    )
    .bind(
      crypto.randomUUID(),
      principal.ownerId,
      principal.actorHash,
      action,
      ENTITY_TYPES[kind],
      entityId,
      principal.ownerId,
      action,
      DAILY_LIMITS[kind],
    )
    .run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    throw new ApiError(
      429,
      "ai_daily_limit",
      "The private daily AI safety limit has been reached. Try again tomorrow.",
    );
  }
}
