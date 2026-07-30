import { database } from "./db";
import type { Principal } from "./principal";

export function receiptExpenseCompletionGuard(
  principal: Principal,
  intakeId: string,
  expenseId: string,
) {
  return database()
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
    .bind(principal.ownerId, intakeId, expenseId);
}
