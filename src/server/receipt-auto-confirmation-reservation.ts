import { database } from "./db";
import type { Principal } from "./principal";

export async function reserveAutomaticConfirmation(
  principal: Principal,
  intakeId: string,
  fingerprint: string,
  leaseToken: string,
): Promise<boolean> {
  const reserved = await database()
    .prepare(
      `INSERT INTO receipt_auto_confirm_reservations (
         owner_id, fingerprint, receipt_intake_id, lease_token
       )
       SELECT ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM receipt_intakes
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND expense_id IS NULL
           AND auto_confirm_token = ?
           AND auto_confirm_lease_expires_at >
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       )
       ON CONFLICT DO NOTHING
       RETURNING receipt_intake_id`,
    )
    .bind(
      principal.ownerId,
      fingerprint,
      intakeId,
      leaseToken,
      principal.ownerId,
      intakeId,
      leaseToken,
    )
    .first<{ receipt_intake_id: string }>();
  if (reserved?.receipt_intake_id === intakeId) return true;
  const existing = await database()
    .prepare(
      `SELECT reservation.receipt_intake_id
       FROM receipt_auto_confirm_reservations AS reservation
       JOIN receipt_intakes AS intake
         ON intake.owner_id = reservation.owner_id
        AND intake.id = reservation.receipt_intake_id
       WHERE reservation.owner_id = ? AND reservation.fingerprint = ?
         AND reservation.receipt_intake_id = ?
         AND reservation.lease_token = ?
         AND intake.status = 'analysing' AND intake.expense_id IS NULL
         AND intake.auto_confirm_token = ?
         AND intake.auto_confirm_lease_expires_at >
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(
      principal.ownerId,
      fingerprint,
      intakeId,
      leaseToken,
      leaseToken,
    )
    .first<{ receipt_intake_id: string }>();
  return existing?.receipt_intake_id === intakeId;
}

export async function releaseAutomaticConfirmationReservation(
  principal: Principal,
  intakeId: string,
  fingerprint: string,
  leaseToken: string,
): Promise<void> {
  await database()
    .prepare(
      `DELETE FROM receipt_auto_confirm_reservations
       WHERE owner_id = ? AND receipt_intake_id = ? AND fingerprint = ?
         AND lease_token = ?
         AND EXISTS (
           SELECT 1 FROM receipt_intakes
           WHERE owner_id = ? AND id = ? AND expense_id IS NULL
             AND status <> 'confirmed'
             AND auto_confirm_token = ?
             AND auto_confirm_lease_expires_at >
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         )`,
    )
    .bind(
      principal.ownerId,
      intakeId,
      fingerprint,
      leaseToken,
      principal.ownerId,
      intakeId,
      leaseToken,
    )
    .run();
}
