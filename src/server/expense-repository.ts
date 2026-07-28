import { ApiError } from "./http";
import { assertDateUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import { mapExpense, type ExpenseRow } from "./models";
import type { Principal } from "./principal";
import { auditStatement } from "./audit-repository";
import type { ExpenseWrite } from "./validation";

const expenseSelect = `SELECT
  e.id, e.service_date, e.merchant, e.location, e.business_reason,
  e.receipt_total_pence, e.eligible_pence, e.gratuity_pence,
  e.currency, e.country, e.trip_id, e.meal_context, e.notes,
  e.created_at, e.updated_at,
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
           WHERE e.owner_id = ? AND e.service_date LIKE ?
           ORDER BY e.service_date DESC, e.created_at DESC`,
        )
        .bind(principal.ownerId, `${period}-%`)
    : database()
        .prepare(
          `${expenseSelect}
           WHERE e.owner_id = ?
           ORDER BY e.service_date DESC, e.created_at DESC`,
        )
        .bind(principal.ownerId);
  const result = await query.all<ExpenseRow>();
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
          currency, country, trip_id, meal_context, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.tripId,
        input.mealContext,
        input.notes,
      ),
    auditStatement(principal, {
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
    auditStatement(principal, {
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
): Promise<string[]> {
  await ensureSchema();
  const row = await database()
    .prepare(
      `SELECT e.id, r.object_key
       FROM expenses e
       LEFT JOIN receipts r
         ON r.expense_id = e.id
        AND r.owner_id = e.owner_id
       WHERE e.owner_id = ? AND e.id = ?`,
    )
    .bind(principal.ownerId, id)
    .first<{ id: string; object_key: string | null }>();
  if (!row) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  const expense = await findExpense(principal, id);
  await assertDateUnlocked(principal.ownerId, expense!.serviceDate);
  const intakeObjects = await database()
    .prepare(
      `SELECT original_object_key, analysis_object_key
       FROM receipt_intakes
       WHERE owner_id = ? AND expense_id = ?`,
    )
    .bind(principal.ownerId, id)
    .all<{
      original_object_key: string;
      analysis_object_key: string | null;
    }>();
  const objectKeys = new Set<string>();
  if (row.object_key) objectKeys.add(row.object_key);
  for (const intake of intakeObjects.results) {
    objectKeys.add(intake.original_object_key);
    if (intake.analysis_object_key) {
      objectKeys.add(intake.analysis_object_key);
    }
  }
  const db = database();
  await db.batch([
    db
      .prepare(
        "DELETE FROM receipt_intakes WHERE owner_id = ? AND expense_id = ?",
      )
      .bind(principal.ownerId, id),
    db
      .prepare("DELETE FROM expenses WHERE owner_id = ? AND id = ?")
      .bind(principal.ownerId, id),
    auditStatement(principal, {
      action: "expense.deleted",
      entityType: "expense",
      entityId: id,
      metadata: {
        confirmedIntakesRemoved: intakeObjects.results.length,
      },
    }),
  ]);
  return [...objectKeys];
}
