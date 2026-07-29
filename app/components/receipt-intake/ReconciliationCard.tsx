"use client";

import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { formatMoney } from "../format";
import type { ReceiptLineItem } from "./types";

export function ReconciliationCard({
  lineItems,
  receiptTotalPence,
  eligiblePence,
  gratuityPence,
  reviewed,
  onReviewed,
  locked,
}: {
  lineItems: readonly ReceiptLineItem[];
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  reviewed: boolean;
  onReviewed: (value: boolean) => void;
  locked: boolean;
}) {
  const result = reconcileReceipt(
    lineItems,
    receiptTotalPence,
    eligiblePence,
    gratuityPence,
  );
  return (
    <section
      className={`receipt-reconciliation ${result.status}`}
      aria-labelledby="reconciliation-heading"
    >
      <div>
        <p className="eyebrow">Arithmetic check</p>
        <h4 id="reconciliation-heading">
          {result.status === "balanced"
            ? "Visible lines balance"
            : result.status === "mismatch"
              ? "Check the totals"
              : "Some lines need checking"}
        </h4>
      </div>
      <dl>
        <div>
          <dt>Visible lines</dt>
          <dd>{formatMoney(result.knownLineTotalPence)}</dd>
        </div>
        <div>
          <dt>Receipt difference</dt>
          <dd>
            {result.receiptDifferencePence === null
              ? "Not enough data"
              : formatMoney(result.receiptDifferencePence)}
          </dd>
        </div>
        <div>
          <dt>Eligible lines</dt>
          <dd>{formatMoney(result.knownEligibleLineTotalPence)}</dd>
        </div>
        <div>
          <dt>Eligible difference</dt>
          <dd>
            {result.eligibleDifferencePence === null
              ? "Not enough data"
              : formatMoney(result.eligibleDifferencePence)}
          </dd>
        </div>
        <div>
          <dt>Unknown amounts</dt>
          <dd>{result.unknownAmountCount}</dd>
        </div>
      </dl>
      {result.issues.map((issue) => <p key={issue}>{issue}</p>)}
      {result.status === "mismatch" && !locked ? (
        <label>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => onReviewed(event.target.checked)}
          />
          I checked this mismatch against the original receipt.
        </label>
      ) : null}
    </section>
  );
}
