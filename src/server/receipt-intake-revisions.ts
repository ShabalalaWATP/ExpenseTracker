import { database } from "./db";
import type { Principal } from "./principal";

export type ReceiptRevisionSource =
  | "ai_initial"
  | "ai_full"
  | "ai_targeted"
  | "manual"
  | "voice";

export function receiptRevisionStatement(
  principal: Principal,
  input: {
    intakeId: string;
    source: ReceiptRevisionSource;
    fields: readonly string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    model?: string | null;
    reasonCode?: string | null;
    transform?: Record<string, number>;
  },
) {
  return database()
    .prepare(
      `INSERT INTO receipt_intake_revisions (
        id, owner_id, receipt_intake_id, source, fields_json,
        before_json, after_json, model, reason_code, transform_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      principal.ownerId,
      input.intakeId,
      input.source,
      JSON.stringify([...input.fields].slice(0, 20)),
      JSON.stringify(input.before),
      JSON.stringify(input.after),
      input.model ?? null,
      input.reasonCode ?? null,
      JSON.stringify(input.transform ?? {}),
    );
}

export function receiptRevisionStatementAfterChange(
  principal: Principal,
  input: Parameters<typeof receiptRevisionStatement>[1],
) {
  return database()
    .prepare(
      `INSERT INTO receipt_intake_revisions (
        id, owner_id, receipt_intake_id, source, fields_json,
        before_json, after_json, model, reason_code, transform_json
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE changes() > 0`,
    )
    .bind(
      crypto.randomUUID(),
      principal.ownerId,
      input.intakeId,
      input.source,
      JSON.stringify([...input.fields].slice(0, 20)),
      JSON.stringify(input.before),
      JSON.stringify(input.after),
      input.model ?? null,
      input.reasonCode ?? null,
      JSON.stringify(input.transform ?? {}),
    );
}
