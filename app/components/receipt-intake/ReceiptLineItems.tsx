import { formatCurrencyMinor } from "../format";
import type { ReceiptLineItem } from "./types";

export function ReceiptLineItems({
  items,
  currency = "GBP",
  minorUnitDigits = 2,
}: {
  items: readonly ReceiptLineItem[];
  currency?: string;
  minorUnitDigits?: number;
}) {
  if (!items.length) return null;
  return (
    <details className="line-items">
      <summary>{items.length} receipt items</summary>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.description}-${index}`}>
            <span className="line-item-description">
              <span>
                {(item.quantity ?? 0) > 1 ? `${item.quantity} × ` : ""}
                {item.originalDescription || item.description}
              </span>
              {item.descriptionEnglish &&
              item.descriptionEnglish !==
                (item.originalDescription || item.description) ? (
                <small>{item.descriptionEnglish}</small>
              ) : null}
            </span>
            {item.alcoholSuspected ? <em>Check alcohol</em> : null}
            <strong>
              {item.originalTotalMinor === null && item.totalPence === null
                ? "—"
                : formatCurrencyMinor(
                    item.originalTotalMinor ?? item.totalPence,
                    currency,
                    minorUnitDigits,
                  )}
            </strong>
          </li>
        ))}
      </ul>
    </details>
  );
}
