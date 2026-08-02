import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import {
  reconciliationLines,
  sharedReceiptServiceAdjustment,
} from "@/src/domain/receipt-reconciliation-lines";
import {
  receiptGroupReview,
  type ReceiptIntakeRow,
} from "./receipt-intake-model";

export function reconcileReceiptIntake(row: ReceiptIntakeRow) {
  const gbp = row.original_currency === "GBP";
  return reconcileReceipt(
    reconciliationLines(row.line_items_json),
    gbp ? row.receipt_total_pence : row.original_receipt_total_minor,
    gbp ? row.eligible_pence : row.original_eligible_minor,
    gbp ? row.gratuity_pence : row.original_gratuity_minor,
    gbp
      ? sharedReceiptServiceAdjustment(
          row.line_items_json,
          row.eligible_pence,
          row.gratuity_pence,
          receiptGroupReview(row).decision === "shared",
        )
      : 0,
  );
}
