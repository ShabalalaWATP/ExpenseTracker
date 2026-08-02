"use client";

import { useMemo, useState } from "react";
import {
  allocatedReceiptLineTotal,
  receiptLineQuantity,
} from "@/src/domain/group-receipt";
import { formatCurrencyMinor } from "../format";
import type { ReceiptIntake } from "./types";

export function GroupReceiptReview({
  intake,
  decision,
  locked,
  onDecision,
  onEligibleAmount,
}: {
  intake: ReceiptIntake;
  decision: "single" | "shared" | null;
  locked: boolean;
  onDecision: (decision: "single" | "shared") => void;
  onEligibleAmount: (
    pounds: string,
    selectedItems: number[],
    selectedQuantities: number[],
  ) => void;
}) {
  const [selectedQuantities, setSelectedQuantities] = useState<number[]>(
    intake.lineItems.map(
      (item, index) =>
        intake.groupReceipt.selectedQuantities[index] ??
        (intake.groupReceipt.selectedItems.includes(index)
          ? receiptLineQuantity(item)
          : 0),
    ),
  );
  const [sharedOpen, setSharedOpen] = useState(decision === "shared");
  const fullQuantities = useMemo(
    () =>
      intake.lineItems.map((item) =>
        !item.alcoholSuspected &&
        (item.groupOriginalEligible ?? item.eligible) !== false
          ? receiptLineQuantity(item)
          : 0,
      ),
    [intake.lineItems],
  );
  const fullEligibleTotal = useMemo(
    () =>
      intake.lineItems.reduce(
        (sum, item, index) =>
          sum +
          allocatedReceiptLineTotal(
            item.originalTotalMinor ?? item.totalPence,
            receiptLineQuantity(item),
            fullQuantities[index] ?? 0,
          ),
        0,
      ),
    [fullQuantities, intake.lineItems],
  );
  const selectedTotal = useMemo(
    () =>
      selectedQuantities.reduce((sum, quantity, index) => {
        const item = intake.lineItems[index];
        if (
          !item ||
          item.alcoholSuspected ||
          (item.groupOriginalEligible ?? item.eligible) === false
        ) return sum;
        return sum + allocatedReceiptLineTotal(
          item.originalTotalMinor ?? item.totalPence,
          receiptLineQuantity(item),
          quantity,
        );
      }, 0),
    [intake.lineItems, selectedQuantities],
  );

  if (!intake.groupReceipt.likelyShared || locked) return null;
  const canAllocateItems = intake.originalCurrency === "GBP";

  return (
    <section className="group-receipt-review" aria-labelledby="group-receipt-title">
      <p className="eyebrow">Possible shared receipt</p>
      <h4 id="group-receipt-title">Which items were yours?</h4>
      <p>
        {intake.groupReceipt.reason} It looks like an order for about{" "}
        {intake.groupReceipt.estimatedPeople} people. If everything was yours,
        say so and the app will keep the full eligible total.
      </p>
      <div className="group-receipt-actions">
        <button
          type="button"
          className={decision === "single" ? "selected" : ""}
          onClick={() => {
            setSharedOpen(false);
            onEligibleAmount(
              (((intake.originalCurrency === "GBP"
                ? fullEligibleTotal
                : intake.eligiblePence) || 0) / 100).toFixed(2),
              fullQuantities.flatMap((quantity, index) =>
                quantity > 0 ? [index] : [],
              ),
              fullQuantities,
            );
            onDecision("single");
          }}
        >
          Everything was mine
        </button>
        <button
          type="button"
          className={sharedOpen ? "selected" : ""}
          onClick={() => setSharedOpen(true)}
        >
          This was shared
        </button>
      </div>
      {sharedOpen && canAllocateItems ? (
        <div className="group-receipt-items">
          <p>Choose how many of each item you had. Your amount updates automatically.</p>
          {intake.lineItems.map((item, index) => {
            const available = receiptLineQuantity(item);
            const quantity = selectedQuantities[index] ?? 0;
            const disabled =
              item.alcoholSuspected ||
              (item.groupOriginalEligible ?? item.eligible) === false;
            const updateQuantity = (next: number) =>
              setSelectedQuantities((current) => {
                const updated = [...current];
                updated[index] = Math.min(available, Math.max(0, next));
                return updated;
              });
            return (
              <div
                className={quantity > 0 ? "selected" : ""}
                key={`${item.description}-${index}`}
              >
                <span className="group-item-name">
                  {available > 1 ? `${available} × ` : ""}
                  {item.descriptionEnglish || item.description}
                </span>
                <strong>
                  {formatCurrencyMinor(
                    item.originalTotalMinor ?? item.totalPence,
                    intake.originalCurrency,
                    intake.originalMinorUnitDigits,
                  )}
                </strong>
                <div
                  className="quantity-stepper"
                  role="group"
                  aria-label={`Your quantity of ${item.descriptionEnglish || item.description}`}
                >
                  <button
                    type="button"
                    aria-label="Remove one"
                    disabled={disabled || quantity === 0}
                    onClick={() => updateQuantity(quantity - 1)}
                  >
                    −
                  </button>
                  <span>{quantity} of {available}</span>
                  <button
                    type="button"
                    aria-label="Add one"
                    disabled={disabled || quantity === available}
                    onClick={() => updateQuantity(quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="use-group-total"
            disabled={!selectedQuantities.some(Boolean) || selectedTotal < 1}
            onClick={() => {
              const selectedItems = selectedQuantities.flatMap(
                (quantity, index) => (quantity > 0 ? [index] : []),
              );
              onEligibleAmount(
                (selectedTotal / 100).toFixed(2),
                selectedItems,
                selectedQuantities,
              );
              onDecision("shared");
            }}
          >
            Use my items: {formatCurrencyMinor(selectedTotal, "GBP", 2)}
          </button>
        </div>
      ) : sharedOpen ? (
        <div className="group-receipt-foreign-note">
          <p>
            Enter the GBP value of your own items in Eligible amount below. The
            original foreign-currency receipt stays attached as evidence.
          </p>
          <button type="button" onClick={() => onDecision("shared")}>
            I have entered my amount
          </button>
        </div>
      ) : null}
    </section>
  );
}
