import { receiptLineQuantity } from "@/src/domain/group-receipt";
import {
  allocateGroupReceipt,
  isServiceChargeLine,
} from "@/src/domain/group-receipt-allocation";
import { ApiError } from "./http";
import {
  receiptGroupReview,
  type ReceiptIntakeRow,
} from "./receipt-intake-model";
import { reviewJson } from "./receipt-intake-review-state";
import type { IntakePatch } from "./receipt-intake-validation";

type StoredAllocationLine = {
  description: string;
  quantity: number | null;
  totalPence: number | null;
  eligible?: boolean | null;
  groupOriginalEligible?: boolean | null;
  alcoholSuspected?: boolean;
};

export function validateGroupReceiptAllocation(
  existing: ReceiptIntakeRow,
  patch: IntakePatch,
): void {
  if (
    patch.groupReceiptDecision !== "shared" ||
    existing.original_currency !== "GBP"
  ) return;
  const lines = reviewJson<StoredAllocationLine[]>(existing.line_items_json, []);
  const selected = patch.groupReceiptSelectedItems ?? [];
  const quantities = patch.groupReceiptSelectedQuantities ?? [];
  const group = receiptGroupReview(existing);
  const method =
    patch.groupReceiptAllocationMethod ?? group.allocationMethod;
  const allocation = allocateGroupReceipt({
    lines,
    selectedQuantities: quantities,
    peopleCount: patch.groupReceiptPeopleCount ?? group.peopleCount,
    method,
    serviceChargePence:
      existing.original_gratuity_minor ?? existing.gratuity_pence,
  });
  const hasSelectedItem = quantities.some(
    (quantity, index) =>
      quantity > 0 &&
      !isServiceChargeLine(lines[index]?.description ?? ""),
  );
  const quantityInvalid = quantities.some(
    (quantity, index) =>
      !isServiceChargeLine(lines[index]?.description ?? "") &&
      quantity >
        receiptLineQuantity(
          lines[index] ?? { description: "", quantity: null },
        ),
  );
  if (
    (method === "items" && !hasSelectedItem) ||
    selected.some((index) => !lines[index]) ||
    quantityInvalid ||
    allocation.totalPence < 1 ||
    allocation.totalPence !== patch.eligiblePence ||
    allocation.serviceChargeSharePence !== patch.gratuityPence
  ) {
    throw new ApiError(
      400,
      "group_receipt_selection_invalid",
      "Choose a valid shared-bill split before confirming this receipt.",
    );
  }
}
