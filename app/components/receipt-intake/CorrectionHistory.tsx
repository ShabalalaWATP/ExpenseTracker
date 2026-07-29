"use client";

import { formatMoney } from "../format";
import type { AnalysisHistoryEntry } from "./types";

function value(
  entry: AnalysisHistoryEntry,
  field: keyof AnalysisHistoryEntry["extraction"],
) {
  const raw = entry.extraction[field];
  if (
    field === "receiptTotalPence" ||
    field === "eligiblePence" ||
    field === "gratuityPence"
  ) {
    return typeof raw === "number" ? formatMoney(raw) : "Not found";
  }
  return raw || "Not found";
}

export function CorrectionHistory({
  entries,
}: {
  entries: readonly AnalysisHistoryEntry[];
}) {
  if (entries.length < 2) return null;
  const previous = entries.at(-2)!;
  const current = entries.at(-1)!;
  const fields = (
    current.targetedFields.length
      ? current.targetedFields
      : ["merchant", "service_date", "receipt_total", "eligible_amount"]
  )
    .map((field) => ({
      merchant: "merchant",
      service_date: "serviceDate",
      receipt_total: "receiptTotalPence",
      eligible_amount: "eligiblePence",
    })[field])
    .filter(
      (field): field is keyof AnalysisHistoryEntry["extraction"] =>
        Boolean(field),
    );
  const changed = fields.filter(
    (field) => value(previous, field) !== value(current, field),
  );
  if (!changed.length) return null;
  return (
    <details className="correction-history" open>
      <summary>Latest AI comparison</summary>
      <dl>
        {changed.map((field) => (
          <div key={field}>
            <dt>{field.replace(/Pence$/, "").replace(/([A-Z])/g, " $1")}</dt>
            <dd><del>{value(previous, field)}</del><ins>{value(current, field)}</ins></dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
