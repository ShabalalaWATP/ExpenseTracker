import type { Principal } from "./principal";
import { database, ensureSchema } from "./db";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export function auditStatement(principal: Principal, input: AuditInput) {
  return database()
    .prepare(
      `INSERT INTO audit_events (
        id, owner_id, actor_hash, action, entity_type, entity_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      principal.ownerId,
      principal.actorHash,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata ?? {}),
    );
}

export async function recordAudit(
  principal: Principal,
  input: AuditInput,
): Promise<void> {
  await ensureSchema();
  await auditStatement(principal, input).run();
}

export async function listAudit(principal: Principal, limit = 100) {
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
  const result = await database()
    .prepare(
      `SELECT id, action, entity_type, entity_id, metadata_json, created_at
       FROM audit_events
       WHERE owner_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(principal.ownerId, safeLimit)
    .all<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata_json: string;
      created_at: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: safeJson(row.metadata_json, {}),
    createdAt: row.created_at,
  }));
}

function safeJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}
