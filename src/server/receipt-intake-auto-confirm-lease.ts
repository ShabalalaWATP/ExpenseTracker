import { database } from "./db";
import { auditStatementAfterChange } from "./audit-repository";
import type { Principal } from "./principal";

export async function acquireAutoConfirmLease(
  principal: Principal,
  id: string,
  expectedUpdatedAt: string,
): Promise<string | null> {
  const leaseToken = crypto.randomUUID();
  const locked = await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'analysing',
           auto_confirm_token = ?,
           auto_confirm_lease_expires_at =
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'ready' AND updated_at = ?
         AND expense_id IS NULL
       RETURNING id`,
    )
    .bind(leaseToken, principal.ownerId, id, expectedUpdatedAt)
    .first<{ id: string }>();
  return locked?.id === id ? leaseToken : null;
}

export async function recoverExpiredAutoConfirmLease(
  principal: Principal,
  id: string,
  leaseToken: string,
): Promise<boolean> {
  const db = database();
  const results = await db.batch<{ id: string }>([
    db
      .prepare(
        `DELETE FROM receipt_auto_confirm_reservations
         WHERE owner_id = ? AND receipt_intake_id = ? AND lease_token = ?
           AND EXISTS (
             SELECT 1 FROM receipt_intakes
             WHERE owner_id = ? AND id = ? AND status = 'analysing'
               AND expense_id IS NULL AND auto_confirm_token = ?
               AND (
                 auto_confirm_lease_expires_at IS NULL OR
                 auto_confirm_lease_expires_at <=
                   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
               )
           )`,
      )
      .bind(
        principal.ownerId,
        id,
        leaseToken,
        principal.ownerId,
        id,
        leaseToken,
      ),
    db
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             error_code = 'receipt_auto_confirmation_interrupted',
             error_message = 'Automatic confirmation was interrupted. Review this receipt before adding it to the ledger.',
             auto_confirm_token = NULL, auto_confirm_lease_expires_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND expense_id IS NULL AND auto_confirm_token = ?
           AND (
             auto_confirm_lease_expires_at IS NULL OR
             auto_confirm_lease_expires_at <=
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           )
         RETURNING id`,
      )
      .bind(principal.ownerId, id, leaseToken),
  ]);
  return results[1]?.results?.some((row) => row.id === id) ?? false;
}

export async function recoverStaleTokenlessAnalysis(
  principal: Principal,
  id: string,
): Promise<boolean> {
  const db = database();
  const results = await db.batch<{ id: string }>([
    db
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             error_code = 'receipt_processing_interrupted',
             error_message = 'Receipt processing was interrupted. Review this receipt before continuing.',
             auto_confirm_token = NULL, auto_confirm_lease_expires_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND expense_id IS NULL AND auto_confirm_token IS NULL
           AND updated_at <=
             strftime(
               '%Y-%m-%dT%H:%M:%fZ',
               'now',
               '-15 minutes'
             )
         RETURNING id`,
      )
      .bind(principal.ownerId, id),
    auditStatementAfterChange(principal, {
      action: "receipt_intake.analysis_recovered",
      entityType: "receipt_intake",
      entityId: id,
      metadata: { reason: "stale_tokenless_analysis" },
    }),
  ]);
  return results[0]?.results?.some((row) => row.id === id) ?? false;
}

export async function abandonAutoConfirmLease(
  principal: Principal,
  id: string,
  leaseToken: string,
): Promise<void> {
  const db = database();
  await db
    .batch([
      db
        .prepare(
          `DELETE FROM receipt_auto_confirm_reservations
           WHERE owner_id = ? AND receipt_intake_id = ? AND lease_token = ?
             AND EXISTS (
               SELECT 1 FROM receipt_intakes
               WHERE owner_id = ? AND id = ? AND status = 'analysing'
                 AND expense_id IS NULL AND auto_confirm_token = ?
                 AND auto_confirm_lease_expires_at >
                   strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             )`,
        )
        .bind(
          principal.ownerId,
          id,
          leaseToken,
          principal.ownerId,
          id,
          leaseToken,
        ),
      db
        .prepare(
          `UPDATE receipt_intakes
           SET status = 'needs_review',
               error_code = 'receipt_auto_confirmation_interrupted',
               error_message = 'Automatic confirmation was interrupted. Review this receipt before adding it to the ledger.',
               auto_confirm_token = NULL, auto_confirm_lease_expires_at = NULL,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE owner_id = ? AND id = ? AND status = 'analysing'
             AND expense_id IS NULL AND auto_confirm_token = ?
             AND auto_confirm_lease_expires_at >
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(principal.ownerId, id, leaseToken),
    ])
    .catch(() => {});
  await recoverExpiredAutoConfirmLease(principal, id, leaseToken).catch(
    () => {},
  );
}
