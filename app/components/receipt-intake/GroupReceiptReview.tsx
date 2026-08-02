"use client";

import { useMemo, useState } from "react";
import {
  allocateGroupReceipt,
  isServiceChargeLine,
  type GroupReceiptAllocationMethod,
} from "@/src/domain/group-receipt-allocation";
import { receiptLineQuantity } from "@/src/domain/group-receipt";
import { formatCurrencyMinor } from "../format";
import type { ReceiptIntake } from "./types";

type AllocationHandler = (
  pounds: string,
  gratuityPounds: string,
  selectedItems: number[],
  selectedQuantities: number[],
  peopleCount: number,
  method: GroupReceiptAllocationMethod,
) => void;

export function GroupReceiptReview({
  intake,
  decision,
  locked,
  onDecision,
  onAllocation,
}: {
  intake: ReceiptIntake;
  decision: "single" | "shared" | null;
  locked: boolean;
  onDecision: (decision: "single" | "shared") => void;
  onAllocation: AllocationHandler;
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
  const [peopleCount, setPeopleCount] = useState(
    intake.groupReceipt.peopleCount || intake.groupReceipt.estimatedPeople,
  );
  const [method, setMethod] = useState<GroupReceiptAllocationMethod>(
    intake.groupReceipt.allocationMethod,
  );
  const allocationLines = useMemo(
    () =>
      intake.lineItems.map((item) => ({
        ...item,
        totalPence: item.originalTotalMinor ?? item.totalPence,
      })),
    [intake.lineItems],
  );
  const fullQuantities = useMemo(
    () =>
      allocationLines.map((item) =>
        !item.alcoholSuspected &&
        (item.groupOriginalEligible ?? item.eligible) !== false
          ? receiptLineQuantity(item)
          : 0,
      ),
    [allocationLines],
  );
  const serviceChargePence =
    intake.originalCurrency === "GBP"
      ? intake.originalGratuityMinor ?? intake.gratuityPence
      : intake.gratuityPence;
  const allocation = useMemo(
    () =>
      allocateGroupReceipt({
        lines: allocationLines,
        selectedQuantities,
        peopleCount,
        method,
        serviceChargePence,
      }),
    [
      allocationLines,
      method,
      peopleCount,
      selectedQuantities,
      serviceChargePence,
    ],
  );
  const fullAllocation = useMemo(
    () =>
      allocateGroupReceipt({
        lines: allocationLines,
        selectedQuantities: fullQuantities,
        peopleCount: 1,
        method: "items",
        serviceChargePence,
      }),
    [allocationLines, fullQuantities, serviceChargePence],
  );

  if (!intake.groupReceipt.likelyShared || locked) return null;
  const canAllocateItems = intake.originalCurrency === "GBP";
  const hasSelectedItems = selectedQuantities.some(
    (quantity, index) =>
      quantity > 0 &&
      !isServiceChargeLine(allocationLines[index]?.description ?? ""),
  );

  function peopleStepper() {
    return (
      <div className="people-count-row">
        <span>
          <strong>People sharing</strong>
          <small>Including you</small>
        </span>
        <div
          className="quantity-stepper people-stepper"
          role="group"
          aria-label="Number of people sharing the receipt"
        >
          <button
            type="button"
            aria-label="Remove one person"
            disabled={peopleCount <= 2}
            onClick={() => setPeopleCount((current) => current - 1)}
          >
            −
          </button>
          <span>{peopleCount} people</span>
          <button
            type="button"
            aria-label="Add one person"
            disabled={peopleCount >= 20}
            onClick={() => setPeopleCount((current) => current + 1)}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="group-receipt-review" aria-labelledby="group-receipt-title">
      <p className="eyebrow">Possible shared receipt</p>
      <h4 id="group-receipt-title">How should your share be worked out?</h4>
      <p>
        {intake.groupReceipt.reason} Tell the app how the bill was shared. Any
        service charge is included automatically.
      </p>
      <div className="group-receipt-actions">
        <button
          type="button"
          className={decision === "single" ? "selected" : ""}
          onClick={() => {
            setSharedOpen(false);
            onAllocation(
              (fullAllocation.totalPence / 100).toFixed(2),
              (serviceChargePence / 100).toFixed(2),
              fullAllocation.selectedItems,
              fullQuantities,
              peopleCount,
              method,
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
      {sharedOpen ? peopleStepper() : null}
      {sharedOpen && canAllocateItems ? (
        <div className="group-receipt-items">
          <div className="allocation-methods" role="group" aria-label="Bill split method">
            <button
              type="button"
              className={method === "equal" ? "selected" : ""}
              onClick={() => setMethod("equal")}
            >
              Split equally
              <small>The eligible bill divided by {peopleCount}</small>
            </button>
            <button
              type="button"
              className={method === "items" ? "selected" : ""}
              onClick={() => setMethod("items")}
            >
              Choose my items
              <small>Your items plus your service-charge share</small>
            </button>
          </div>
          {serviceChargePence > 0 ? (
            <div className="service-charge-share">
              <span>Service charge</span>
              <strong>
                {formatCurrencyMinor(serviceChargePence, "GBP", 2)} ÷ {peopleCount} ={" "}
                {formatCurrencyMinor(
                  allocation.serviceChargeSharePence,
                  "GBP",
                  2,
                )}
              </strong>
            </div>
          ) : null}
          {method === "items" ? (
            <>
              <p>Choose how many of each item you had.</p>
              {allocationLines.map((item, index) => {
                if (isServiceChargeLine(item.description)) return null;
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
                    <strong>{formatCurrencyMinor(item.totalPence, "GBP", 2)}</strong>
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
            </>
          ) : (
            <p className="equal-split-note">
              Your equal share includes food, drink and service charge.
            </p>
          )}
          <button
            type="button"
            className="use-group-total"
            disabled={
              allocation.totalPence < 1 ||
              (method === "items" && !hasSelectedItems)
            }
            onClick={() => {
              onAllocation(
                (allocation.totalPence / 100).toFixed(2),
                (allocation.serviceChargeSharePence / 100).toFixed(2),
                allocation.selectedItems,
                selectedQuantities,
                peopleCount,
                method,
              );
              onDecision("shared");
            }}
          >
            Use {method === "equal" ? "equal share" : "my items"}:{" "}
            {formatCurrencyMinor(allocation.totalPence, "GBP", 2)}
          </button>
        </div>
      ) : sharedOpen ? (
        <div className="group-receipt-foreign-note">
          <p>
            Enter the GBP value of your share below. The original
            foreign-currency receipt stays attached as evidence.
          </p>
          <button type="button" onClick={() => onDecision("shared")}>Save shared receipt</button>
        </div>
      ) : null}
    </section>
  );
}
