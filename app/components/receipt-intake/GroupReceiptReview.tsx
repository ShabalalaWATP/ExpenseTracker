"use client";

import { useMemo, useState } from "react";
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
  onEligibleAmount: (pounds: string, selectedItems: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>(
    intake.groupReceipt.selectedItems,
  );
  const [sharedOpen, setSharedOpen] = useState(decision === "shared");
  const selectedTotal = useMemo(
    () =>
      selected.reduce((sum, index) => {
        const item = intake.lineItems[index];
        if (!item || item.alcoholSuspected || item.eligible === false) return sum;
        return sum + (item.originalTotalMinor ?? item.totalPence ?? 0);
      }, 0),
    [intake.lineItems, selected],
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
          <p>Select your items. The eligible amount will update automatically.</p>
          {intake.lineItems.map((item, index) => (
            <label key={`${item.description}-${index}`}>
              <input
                type="checkbox"
                checked={selected.includes(index)}
                disabled={item.alcoholSuspected || item.eligible === false}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, index]
                      : current.filter((value) => value !== index),
                  )
                }
              />
              <span>
                {(item.quantity ?? 0) > 1 ? `${item.quantity} × ` : ""}
                {item.descriptionEnglish || item.description}
              </span>
              <strong>
                {formatCurrencyMinor(
                  item.originalTotalMinor ?? item.totalPence,
                  intake.originalCurrency,
                  intake.originalMinorUnitDigits,
                )}
              </strong>
            </label>
          ))}
          <button
            type="button"
            className="use-group-total"
            disabled={!selected.length || selectedTotal < 1}
            onClick={() => {
              onEligibleAmount((selectedTotal / 100).toFixed(2), selected);
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
