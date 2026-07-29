import type { ReceiptLineItem } from "./types";

export function ReceiptLineItems({
  items,
}: {
  items: readonly ReceiptLineItem[];
}) {
  if (!items.length) return null;
  return (
    <details className="line-items">
      <summary>{items.length} receipt items</summary>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.description}-${index}`}>
            <span>
              {(item.quantity ?? 0) > 1 ? `${item.quantity} × ` : ""}
              {item.description}
            </span>
            {item.alcoholSuspected ? <em>Check alcohol</em> : null}
            <strong>
              {item.totalPence === null
                ? "—"
                : `£${(item.totalPence / 100).toFixed(2)}`}
            </strong>
          </li>
        ))}
      </ul>
    </details>
  );
}
