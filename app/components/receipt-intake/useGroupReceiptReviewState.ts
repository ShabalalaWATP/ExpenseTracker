"use client";

import { useState } from "react";
import type { ReceiptIntake } from "./types";

export function useGroupReceiptReviewState(intake: ReceiptIntake) {
  const [decision, setDecision] = useState<"single" | "shared" | null>(
    intake.groupReceipt.decision,
  );
  const [selectedItems, setSelectedItems] = useState<number[]>(
    intake.groupReceipt.selectedItems,
  );
  const [selectedQuantities, setSelectedQuantities] = useState<number[]>(
    intake.groupReceipt.selectedQuantities,
  );
  const [peopleCount, setPeopleCount] = useState(
    intake.groupReceipt.peopleCount,
  );
  const [allocationMethod, setAllocationMethod] = useState<"items" | "equal">(
    intake.groupReceipt.allocationMethod,
  );

  function accept(updated: ReceiptIntake) {
    setDecision(updated.groupReceipt.decision);
    setSelectedItems(updated.groupReceipt.selectedItems);
    setSelectedQuantities(updated.groupReceipt.selectedQuantities);
    setPeopleCount(updated.groupReceipt.peopleCount);
    setAllocationMethod(updated.groupReceipt.allocationMethod);
  }

  return {
    decision,
    setDecision,
    selectedItems,
    setSelectedItems,
    selectedQuantities,
    setSelectedQuantities,
    peopleCount,
    setPeopleCount,
    allocationMethod,
    setAllocationMethod,
    accept,
  };
}
