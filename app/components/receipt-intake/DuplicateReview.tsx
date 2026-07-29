"use client";

import { formatMoney } from "../format";
import type { DuplicateCandidate } from "./types";

export function DuplicateReview({
  candidates,
  reviewed,
  onReviewed,
  locked,
}: {
  candidates: readonly DuplicateCandidate[];
  reviewed: boolean;
  onReviewed: (value: boolean) => void;
  locked: boolean;
}) {
  if (!candidates.length) return null;
  return (
    <section className="duplicate-review" aria-labelledby="duplicate-heading">
      <div>
        <p className="eyebrow">Possible duplicate</p>
        <h4 id="duplicate-heading">Compare before confirming</h4>
      </div>
      <ul>
        {candidates.map((candidate) => (
          <li key={`${candidate.kind}-${candidate.id}`}>
            <span>
              <strong>{candidate.merchant}</strong>
              <small>{candidate.serviceDate} · {candidate.reason}</small>
            </span>
            <b>{formatMoney(candidate.receiptTotalPence)}</b>
          </li>
        ))}
      </ul>
      {!locked ? (
        <label>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => onReviewed(event.target.checked)}
          />
          I compared these records and this is a separate receipt.
        </label>
      ) : null}
    </section>
  );
}
