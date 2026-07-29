import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { auditStatement } from "./audit-repository";
import { assertDateUnlocked } from "./claim-locks";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { assertDuplicatesReviewed } from "./receipt-duplicates";
import { publicIntake, unresolvedFields } from "./receipt-intake-model";
import { requireIntake } from "./receipt-intake-repository";

function reconciliationLines(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        totalPence: Number.isSafeInteger(item.totalPence)
          ? (item.totalPence as number)
          : null,
        eligible:
          typeof item.eligible === "boolean" ? item.eligible : null,
      }));
  } catch {
    return [];
  }
}

async function releaseLock(
  principal: Principal,
  id: string,
  priorStatus: string,
) {
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL`,
    )
    .bind(priorStatus, principal.ownerId, id)
    .run()
    .catch(() => {});
}

export async function confirmReceiptIntake(
  principal: Principal,
  id: string,
) {
  const initial = await requireIntake(principal, id);
  if (initial.status === "confirmed") {
    throw new ApiError(409, "receipt_confirmed", "This receipt is already confirmed.");
  }
  if (initial.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before confirming it.",
    );
  }
  const locked = await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'analysing',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = ? AND updated_at = ?
       RETURNING id`,
    )
    .bind(principal.ownerId, id, initial.status, initial.updated_at)
    .first<{ id: string }>();
  if (!locked) {
    throw new ApiError(
      409,
      "receipt_changed",
      "This receipt changed in another tab. Reopen it before confirming.",
    );
  }

  try {
    const row = await requireIntake(principal, id);
    const unresolved = unresolvedFields(row);
    if (unresolved.length) {
      throw new ApiError(
        409,
        "receipt_needs_review",
        "Resolve the highlighted receipt details before confirming.",
        { fields: unresolved },
      );
    }
    if (
      !row.merchant ||
      !row.service_date ||
      !row.location ||
      !row.business_reason ||
      row.receipt_total_pence === null ||
      row.eligible_pence === null
    ) {
      throw new ApiError(
        409,
        "receipt_needs_review",
        "Complete all required receipt details before confirming.",
      );
    }
    if (
      row.eligible_pence > row.receipt_total_pence ||
      row.gratuity_pence > row.eligible_pence
    ) {
      throw new ApiError(
        400,
        "validation_failed",
        "Eligible amount and gratuity must fit within the receipt total.",
      );
    }
    const reconciliation = reconcileReceipt(
      reconciliationLines(row.line_items_json),
      row.receipt_total_pence,
      row.eligible_pence,
      row.gratuity_pence,
    );
    if (
      reconciliation.status === "mismatch" &&
      !Boolean(row.reconciliation_reviewed)
    ) {
      throw new ApiError(
        409,
        "receipt_reconciliation_review_required",
        "Check the receipt arithmetic and acknowledge the mismatch before confirming.",
        reconciliation,
      );
    }
    await assertDuplicatesReviewed(principal, id, {
      merchant: row.merchant,
      serviceDate: row.service_date,
      receiptTotalPence: row.receipt_total_pence,
    });
    await assertDateUnlocked(principal.ownerId, row.service_date);
    if (row.trip_id) {
      const trip = await database()
        .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
        .bind(principal.ownerId, row.trip_id)
        .first<{ id: string }>();
      if (!trip) {
        throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
      }
    }
    const expenseId = crypto.randomUUID();
    const receiptId = crypto.randomUUID();
    const db = database();
    await db.batch([
      db
        .prepare(
          `INSERT INTO expenses (
            id, owner_id, service_date, merchant, location, business_reason,
            receipt_total_pence, eligible_pence, gratuity_pence,
            currency, country, trip_id, meal_context, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'GBP', 'GB', ?, ?, ?)`,
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
          row.meal_context,
          row.ai_model
            ? `Receipt details suggested by ${row.ai_model} and confirmed by the owner.`
            : "Receipt details entered and confirmed by the owner.",
        ),
      db
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
        ),
      db
        .prepare(
          `UPDATE receipt_intakes
           SET status = 'confirmed', expense_id = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE owner_id = ? AND id = ? AND status = 'analysing'
             AND expense_id IS NULL`,
        )
        .bind(expenseId, principal.ownerId, id),
      auditStatement(principal, {
        action: "receipt_intake.confirmed",
        entityType: "expense",
        entityId: expenseId,
        metadata: {
          sourceIntakeId: id,
          aiAssisted: Boolean(row.ai_model),
        },
      }),
    ]);
    return {
      intake: publicIntake(await requireIntake(principal, id)),
      expense: {
        id: expenseId,
        serviceDate: row.service_date,
        merchant: row.merchant,
        receiptTotalPence: row.receipt_total_pence,
        eligiblePence: row.eligible_pence,
        location: row.location,
        businessReason: row.business_reason,
        tripId: row.trip_id,
        mealContext: row.meal_context,
        receipt: {
          id: receiptId,
          url: `/api/receipts/${receiptId}`,
        },
      },
    };
  } catch (error) {
    await releaseLock(principal, id, initial.status);
    throw error;
  }
}
