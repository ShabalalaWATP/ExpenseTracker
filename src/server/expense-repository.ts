import { ApiError } from "./http";
import { assertDateUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import { mapExpense, type ExpenseRow } from "./models";
import type { ExpenseWrite } from "./validation";

const expenseSelect = `SELECT
  e.id, e.service_date, e.merchant, e.location, e.business_reason,
  e.receipt_total_pence, e.eligible_pence, e.gratuity_pence,
  e.currency, e.country, e.trip_id, e.meal_context, e.notes,
  e.created_at, e.updated_at,
  r.id AS receipt_id, r.content_type, r.byte_size,
  r.created_at AS receipt_created_at
FROM expenses e
LEFT JOIN receipts r ON r.expense_id = e.id`;

async function requireTrip(tripId: string | null | undefined): Promise<void> {
  if (!tripId) return;
  const trip = await database()
    .prepare("SELECT id FROM trips WHERE id = ?")
    .bind(tripId)
    .first<{ id: string }>();
  if (!trip) {
    throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
  }
}

export async function listExpenses(period?: string) {
  await ensureSchema();
  const query = period
    ? database()
        .prepare(`${expenseSelect} WHERE e.service_date LIKE ? ORDER BY e.service_date DESC, e.created_at DESC`)
        .bind(`${period}-%`)
    : database().prepare(`${expenseSelect} ORDER BY e.service_date DESC, e.created_at DESC`);
  const result = await query.all<ExpenseRow>();
  return result.results.map(mapExpense);
}

export async function findExpense(id: string) {
  await ensureSchema();
  const row = await database()
    .prepare(`${expenseSelect} WHERE e.id = ?`)
    .bind(id)
    .first<ExpenseRow>();
  return row ? mapExpense(row) : null;
}

export async function createExpense(input: ExpenseWrite) {
  await ensureSchema();
  await assertDateUnlocked(input.serviceDate!);
  await requireTrip(input.tripId);
  const id = crypto.randomUUID();
  await database()
    .prepare(
      `INSERT INTO expenses (
        id, service_date, merchant, location, business_reason,
        receipt_total_pence, eligible_pence, gratuity_pence,
        currency, country, trip_id, meal_context, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
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
    )
    .run();
  return (await findExpense(id))!;
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

export async function updateExpense(id: string, input: ExpenseWrite) {
  await ensureSchema();
  const existing = await findExpense(id);
  if (!existing) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  await assertDateUnlocked(existing.serviceDate);
  if (input.serviceDate && input.serviceDate !== existing.serviceDate) {
    await assertDateUnlocked(input.serviceDate);
  }
  await requireTrip(input.tripId);
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
  await database()
    .prepare(
      `UPDATE expenses
       SET ${assignments.join(", ")},
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    )
    .bind(...values, id)
    .run();
  return (await findExpense(id))!;
}

export async function deleteExpense(id: string): Promise<string | null> {
  await ensureSchema();
  const row = await database()
    .prepare(
      `SELECT e.id, r.object_key
       FROM expenses e LEFT JOIN receipts r ON r.expense_id = e.id
       WHERE e.id = ?`,
    )
    .bind(id)
    .first<{ id: string; object_key: string | null }>();
  if (!row) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  const expense = await findExpense(id);
  await assertDateUnlocked(expense!.serviceDate);
  await database().prepare("DELETE FROM expenses WHERE id = ?").bind(id).run();
  return row.object_key;
}
