import { ApiError } from "./http";
import { assertDateUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import { mapExpense, type ExpenseRow } from "./models";
import type { Principal } from "./principal";
import {
  auditStatementAfterChange,
} from "./audit-repository";
import type { ExpenseWrite } from "./validation";

const expenseSelect = `SELECT
  e.id, e.service_date, e.merchant, e.location, e.business_reason,
  e.receipt_total_pence, e.eligible_pence, e.gratuity_pence,
  e.currency, e.country, e.original_currency, e.original_country,
  e.original_language, e.original_receipt_total_minor,
  e.original_eligible_minor, e.original_gratuity_minor,
  e.original_minor_unit_digits, e.exchange_rate_quote_id,
  e.translation_json, e.conversion_json,
  e.trip_id, e.trip_leg_id, e.meal_context, e.category, e.notes,
  e.deleted_at, e.created_at, e.updated_at,
  r.id AS receipt_id, r.content_type, r.byte_size,
  r.created_at AS receipt_created_at
FROM expenses e
LEFT JOIN receipts r
  ON r.expense_id = e.id
 AND r.owner_id = e.owner_id`;

async function requireTrip(
  principal: Principal,
  tripId: string | null | undefined,
): Promise<void> {
  if (!tripId) return;
  const trip = await database()
    .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, tripId)
    .first<{ id: string }>();
  if (!trip) {
    throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
  }
}

export async function listExpenses(principal: Principal, period?: string) {
  await ensureSchema();
  const query = period
    ? database()
        .prepare(
          `${expenseSelect}
           WHERE e.owner_id = ? AND e.deleted_at IS NULL
             AND e.service_date LIKE ?
           ORDER BY e.service_date DESC, e.created_at DESC`,
        )
        .bind(principal.ownerId, `${period}-%`)
    : database()
        .prepare(
          `${expenseSelect}
           WHERE e.owner_id = ? AND e.deleted_at IS NULL
           ORDER BY e.service_date DESC, e.created_at DESC`,
        )
        .bind(principal.ownerId);
  const result = await query.all<ExpenseRow>();
  return result.results.map(mapExpense);
}

export async function listDeletedExpenses(principal: Principal) {
  await ensureSchema();
  const result = await database()
    .prepare(
      `${expenseSelect}
       WHERE e.owner_id = ? AND e.deleted_at IS NOT NULL
       ORDER BY e.deleted_at DESC
       LIMIT 100`,
    )
    .bind(principal.ownerId)
    .all<ExpenseRow>();
  return result.results.map(mapExpense);
}

export async function findExpense(principal: Principal, id: string) {
  await ensureSchema();
  const row = await database()
    .prepare(`${expenseSelect} WHERE e.owner_id = ? AND e.id = ?`)
    .bind(principal.ownerId, id)
    .first<ExpenseRow>();
  return row ? mapExpense(row) : null;
}

export async function createExpense(principal: Principal, input: ExpenseWrite) {
  await ensureSchema();
  await assertDateUnlocked(principal.ownerId, input.serviceDate!);
  await requireTrip(principal, input.tripId);
  const id = crypto.randomUUID();
  const db = database();
  await db.batch([
    db
      .prepare(
        `INSERT INTO expenses (
          id, owner_id, service_date, merchant, location, business_reason,
          receipt_total_pence, eligible_pence, gratuity_pence,
          currency, country, original_currency, original_country,
          original_language, original_receipt_total_minor,
          original_eligible_minor, original_gratuity_minor,
          original_minor_unit_digits, translation_json, conversion_json,
          trip_id, meal_context, category, notes
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'GBP', 'GB', 'und', ?, ?, ?, 2, '{}',
          '{"source":"identity","provider":"identity","fromCurrency":"GBP","toCurrency":"GBP","rateDisplay":"1","observationDate":null,"rounding":"half_up","indicative":false}',
          ?, ?, ?, ?
        )`,
      )
      .bind(
        id,
        principal.ownerId,
        input.serviceDate,
        input.merchant,
        input.location,
        input.businessReason,
        input.receiptTotalPence,
        input.eligiblePence,
        input.gratuityPence,
        input.currency,
        input.country,
        input.receiptTotalPence,
        input.eligiblePence,
        input.gratuityPence,
        input.tripId,
        input.mealContext,
        input.category ?? "food",
        input.notes,
      ),
    auditStatementAfterChange(principal, {
      action: "expense.created",
      entityType: "expense",
      entityId: id,
    }),
  ]);
  return (await findExpense(principal, id))!;
}

const expenseColumns: Record<keyof ExpenseWrite, string> = {
  serviceDate: "service_date",
  merchant: "merchant",
  location: "location",
  businessReason: "business_reason",
  receiptTotalPence: "receipt_total_pence",
  eligiblePence: "eligible_pence",
  gratuityPence: "gratuity_pence",
  currency: "currency",
  country: "country",
  tripId: "trip_id",
  mealContext: "meal_context",
  category: "category",
  notes: "notes",
};

export async function updateExpense(
  principal: Principal,
  id: string,
  input: ExpenseWrite,
) {
  await ensureSchema();
  const existing = await findExpense(principal, id);
  if (!existing) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  if (existing.deletedAt) {
    throw new ApiError(
      409,
      "expense_deleted",
      "Restore this expense before editing it.",
    );
  }
  await assertDateUnlocked(principal.ownerId, existing.serviceDate);
  if (input.serviceDate && input.serviceDate !== existing.serviceDate) {
    await assertDateUnlocked(principal.ownerId, input.serviceDate);
  }
  await requireTrip(principal, input.tripId);
  const receiptTotal = input.receiptTotalPence ?? existing.receiptTotalPence;
  const eligible = input.eligiblePence ?? existing.eligiblePence;
  const gratuity = input.gratuityPence ?? existing.gratuityPence;
  if (eligible > receiptTotal || gratuity > eligible) {
    throw new ApiError(
      400,
      "validation_failed",
      "The eligible amount and gratuity must fit within the receipt total.",
    );
  }
  const entries = Object.entries(input) as [keyof ExpenseWrite, unknown][];
  const assignments = entries.map(([key]) => `${expenseColumns[key]} = ?`);
  const values = entries.map(([, value]) => value);
  if ("tripId" in input) {
    assignments.push("trip_leg_id = NULL");
  }
  const db = database();
  await db.batch([
    db
      .prepare(
        `UPDATE expenses
         SET ${assignments.join(", ")},
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(...values, principal.ownerId, id),
    db
      .prepare(
        `UPDATE expenses
         SET original_receipt_total_minor = receipt_total_pence,
             original_eligible_minor = eligible_pence,
             original_gratuity_minor = gratuity_pence,
             original_minor_unit_digits = 2,
             conversion_json =
               '{"source":"identity","provider":"identity","fromCurrency":"GBP","toCurrency":"GBP","rateDisplay":"1","observationDate":null,"rounding":"half_up","indicative":false}'
         WHERE owner_id = ? AND id = ?
           AND original_currency = 'GBP'
           AND exchange_rate_quote_id IS NULL`,
      )
      .bind(principal.ownerId, id),
    auditStatementAfterChange(principal, {
      action: "expense.updated",
      entityType: "expense",
      entityId: id,
    }),
  ]);
  return (await findExpense(principal, id))!;
}

export async function deleteExpense(
  principal: Principal,
  id: string,
): Promise<void> {
  await ensureSchema();
  const expense = await findExpense(principal, id);
  if (!expense) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  if (expense.deletedAt) {
    return;
  }
  await assertDateUnlocked(principal.ownerId, expense.serviceDate);
  const db = database();
  await db.batch([
    db
      .prepare(
        `UPDATE expenses
         SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`,
      )
      .bind(principal.ownerId, id),
    auditStatementAfterChange(principal, {
      action: "expense.soft_deleted",
      entityType: "expense",
      entityId: id,
    }),
  ]);
}

export async function restoreExpense(
  principal: Principal,
  id: string,
) {
  await ensureSchema();
  const expense = await findExpense(principal, id);
  if (!expense) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  if (!expense.deletedAt) {
    return expense;
  }
  await assertDateUnlocked(principal.ownerId, expense.serviceDate);
  const db = database();
  await db.batch([
    db
      .prepare(
        `UPDATE expenses
         SET deleted_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND deleted_at IS NOT NULL`,
      )
      .bind(principal.ownerId, id),
    auditStatementAfterChange(principal, {
      action: "expense.restored",
      entityType: "expense",
      entityId: id,
    }),
  ]);
  return (await findExpense(principal, id))!;
}
