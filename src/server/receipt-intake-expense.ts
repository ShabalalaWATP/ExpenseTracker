import {
  auditStatement,
  auditStatementAfterChange,
} from "./audit-repository";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { safeJson, type Provenance } from "./receipt-analysis-merge";
import { publicIntake, type ReceiptIntakeRow } from "./receipt-intake-model";
import { requireIntake } from "./receipt-intake-repository";

export type AutoConfirmationAudit = {
  verifierModel: string;
  verifierResult: string;
  verifierMinimumConfidence: number | null;
};

export async function commitReceiptIntakeExpense(
  principal: Principal,
  row: ReceiptIntakeRow,
  options: {
    automatic: boolean;
    reservationFingerprint?: string;
    leaseToken?: string;
    verificationAudit?: AutoConfirmationAudit;
  },
) {
  const expenseId = crypto.randomUUID();
  const receiptId = crypto.randomUUID();
  const category = row.category ?? "food";
  const explicitTripSelection =
    safeJson<Provenance>(row.correction_provenance_json, {}).trip_id ===
    "owner";
  const notes = row.ai_model
    ? options.automatic
      ? `Receipt details suggested by ${row.ai_model} and automatically confirmed after strict checks.`
      : `Receipt details suggested by ${row.ai_model} and confirmed by the owner.`
    : "Receipt details entered and confirmed by the owner.";
  const db = database();
  const expenseInsert = options.automatic
    ? db
        .prepare(
          `INSERT INTO expenses (
            id, owner_id, service_date, merchant, location, business_reason,
            receipt_total_pence, eligible_pence, gratuity_pence,
            currency, country, trip_id, meal_context, category, notes
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'GB', ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM receipt_auto_confirm_reservations
            WHERE owner_id = ? AND fingerprint = ? AND receipt_intake_id = ?
              AND lease_token = ?
          ) AND EXISTS (
            SELECT 1 FROM receipt_intakes
            WHERE owner_id = ? AND id = ? AND status = 'analysing'
              AND expense_id IS NULL
              AND auto_confirm_token = ?
              AND auto_confirm_lease_expires_at >
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          ) AND (
            ? IS NULL OR EXISTS (
              SELECT 1 FROM trips
              WHERE owner_id = ? AND id = ? AND country = 'GB'
                AND (
                  ? = 1 OR EXISTS (
                    SELECT 1 FROM trip_days
                    WHERE owner_id = ? AND trip_id = ? AND date = ?
                      AND eligible = 1 AND confirmed = 1
                  )
                )
            )
          )`,
        )
        .bind(
          expenseId,
          principal.ownerId,
          row.service_date,
          row.merchant,
          row.location,
          row.business_reason,
          row.receipt_total_pence,
          row.eligible_pence,
          row.gratuity_pence,
          row.trip_id,
          category === "food" ? row.meal_context : null,
          category,
          notes,
          principal.ownerId,
          options.reservationFingerprint ?? "",
          row.id,
          options.leaseToken ?? "",
          principal.ownerId,
          row.id,
          options.leaseToken ?? "",
          row.trip_id,
          principal.ownerId,
          row.trip_id,
          Number(explicitTripSelection),
          principal.ownerId,
          row.trip_id,
          row.service_date,
        )
    : db
        .prepare(
          `INSERT INTO expenses (
            id, owner_id, service_date, merchant, location, business_reason,
            receipt_total_pence, eligible_pence, gratuity_pence,
            currency, country, trip_id, meal_context, category, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'GB', ?, ?, ?, ?)`,
        )
        .bind(
          expenseId,
          principal.ownerId,
          row.service_date,
          row.merchant,
          row.location,
          row.business_reason,
          row.receipt_total_pence,
          row.eligible_pence,
          row.gratuity_pence,
          row.trip_id,
          category === "food" ? row.meal_context : null,
          category,
          notes,
        );
  const receiptInsert = options.automatic
    ? db
        .prepare(
          `INSERT INTO receipts (
            id, owner_id, expense_id, object_key, content_type,
            byte_size, sha256, idempotency_key
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM expenses WHERE owner_id = ? AND id = ?
          ) AND EXISTS (
            SELECT 1
            FROM receipt_intakes AS intake
            JOIN receipt_auto_confirm_reservations AS reservation
              ON reservation.owner_id = intake.owner_id
             AND reservation.receipt_intake_id = intake.id
            WHERE intake.owner_id = ? AND intake.id = ?
              AND intake.status = 'analysing' AND intake.expense_id IS NULL
              AND intake.auto_confirm_token = ?
              AND intake.auto_confirm_lease_expires_at >
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
              AND reservation.fingerprint = ?
              AND reservation.lease_token = ?
          )`,
        )
        .bind(
          receiptId,
          principal.ownerId,
          expenseId,
          row.original_object_key,
          row.content_type,
          row.byte_size,
          row.sha256,
          row.idempotency_key,
          principal.ownerId,
          expenseId,
          principal.ownerId,
          row.id,
          options.leaseToken ?? "",
          options.reservationFingerprint ?? "",
          options.leaseToken ?? "",
        )
    : db
        .prepare(
          `INSERT INTO receipts (
            id, owner_id, expense_id, object_key, content_type,
            byte_size, sha256, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          receiptId,
          principal.ownerId,
          expenseId,
          row.original_object_key,
          row.content_type,
          row.byte_size,
          row.sha256,
          row.idempotency_key,
        );
  const update = db
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'confirmed', expense_id = ?, trip_id = ?,
           correction_provenance_json = ?,
           error_code = NULL, error_message = NULL,
           auto_confirm_token = NULL, auto_confirm_lease_expires_at = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL
         ${options.automatic
           ? `AND auto_confirm_token = ?
              AND auto_confirm_lease_expires_at >
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
           : ""}
         AND EXISTS (
           SELECT 1 FROM expenses WHERE owner_id = ? AND id = ?
         )
         ${options.automatic
           ? `AND EXISTS (
                SELECT 1 FROM receipt_auto_confirm_reservations
                WHERE owner_id = ? AND fingerprint = ?
                  AND receipt_intake_id = ?
                  AND lease_token = ?
              )`
           : ""}`,
    )
    .bind(
      expenseId,
      row.trip_id,
      row.correction_provenance_json,
      principal.ownerId,
      row.id,
      ...(options.automatic ? [options.leaseToken ?? ""] : []),
      principal.ownerId,
      expenseId,
      ...(options.automatic
        ? [
            principal.ownerId,
            options.reservationFingerprint ?? "",
            row.id,
            options.leaseToken ?? "",
          ]
        : []),
    );
  const completionGuard = db
    .prepare(
      `SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM receipt_intakes
           WHERE owner_id = ? AND id = ? AND status = 'confirmed'
             AND expense_id = ?
             AND auto_confirm_token IS NULL
             AND auto_confirm_lease_expires_at IS NULL
         ) THEN 1
         ELSE abs(-9223372036854775808)
       END`,
    )
    .bind(principal.ownerId, row.id, expenseId);
  await db.batch([
    expenseInsert,
    receiptInsert,
    update,
    (options.automatic ? auditStatementAfterChange : auditStatement)(
      principal,
      {
      action: options.automatic
        ? "receipt_intake.auto_confirmed"
        : "receipt_intake.confirmed",
      entityType: "expense",
      entityId: expenseId,
      metadata: {
        sourceIntakeId: row.id,
        aiAssisted: Boolean(row.ai_model),
        automatic: options.automatic,
        verifierModel: options.verificationAudit?.verifierModel ?? null,
        verifierResult: options.verificationAudit?.verifierResult ?? null,
        verifierMinimumConfidence:
          options.verificationAudit?.verifierMinimumConfidence ?? null,
      },
      },
    ),
    ...(options.automatic ? [completionGuard] : []),
  ]);
  const confirmed = await requireIntake(principal, row.id);
  if (confirmed.status !== "confirmed" || confirmed.expense_id !== expenseId) {
    throw new ApiError(
      409,
      "receipt_auto_confirmation_changed",
      "The receipt changed while automatic confirmation was finishing.",
    );
  }
  return {
    intake: publicIntake(confirmed),
    expense: {
      id: expenseId,
      serviceDate: row.service_date,
      merchant: row.merchant,
      receiptTotalPence: row.receipt_total_pence,
      eligiblePence: row.eligible_pence,
      location: row.location,
      businessReason: row.business_reason,
      tripId: row.trip_id,
      mealContext: category === "food" ? row.meal_context : null,
      category,
      receipt: {
        id: receiptId,
        url: `/api/receipts/${receiptId}`,
      },
    },
  };
}
