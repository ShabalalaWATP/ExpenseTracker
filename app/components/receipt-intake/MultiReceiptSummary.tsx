import { formatCurrencyMinor, formatDate } from "../format";
import type { ReceiptIntake } from "./types";

function relationshipCopy(intake: ReceiptIntake, distinctCount: number): string {
  if (distinctCount === 1) {
    return "These appear to be copies of one transaction, so the total was counted once.";
  }
  if (intake.multiReceipt.sameMeal === true) {
    return "The distinct transactions were added together as one meal.";
  }
  if (intake.multiReceipt.sameMeal === false) {
    return "The receipts do not appear to form one meal, so this needs review.";
  }
  return "The relationship between these receipts is unclear, so this needs review.";
}

export function MultiReceiptSummary({ intake }: { intake: ReceiptIntake }) {
  if (intake.receiptDocuments.length < 2) return null;
  const distinctCount = intake.receiptDocuments.filter(
    (document) => document.duplicateOfDocumentIndex === null,
  ).length;

  return (
    <section className="multi-receipt-summary" aria-label="Receipts in this photo">
      <div className="multi-receipt-heading">
        <div>
          <p className="eyebrow">Multi-receipt photo</p>
          <h4>{intake.receiptDocuments.length} receipts in this photo</h4>
        </div>
        <span>
          {distinctCount} distinct {distinctCount === 1 ? "transaction" : "transactions"}
        </span>
      </div>
      <p>
        {relationshipCopy(intake, distinctCount)} The complete original photo is kept as the
        evidence, including every receipt shown.
      </p>
      <ol className="multi-receipt-documents">
        {intake.receiptDocuments.map((document) => (
          <li key={document.documentIndex}>
            <div>
              <strong>Receipt {document.documentIndex}</strong>
              <span>{document.merchant || "Merchant not read"}</span>
            </div>
            <div>
              <span>
                {document.serviceDate ? formatDate(document.serviceDate) : "Date not read"}
                {document.transactionTime ? ` at ${document.transactionTime}` : ""}
              </span>
              <strong>
                {formatCurrencyMinor(
                  document.receiptTotalPence,
                  document.currency,
                  intake.originalMinorUnitDigits ?? 2,
                )}
              </strong>
            </div>
            {document.duplicateOfDocumentIndex !== null ? (
              <small>
                Copy of receipt {document.duplicateOfDocumentIndex}, not counted twice
              </small>
            ) : null}
          </li>
        ))}
      </ol>
      {intake.multiReceipt.reason ? (
        <small className="multi-receipt-reason">AI assessment: {intake.multiReceipt.reason}</small>
      ) : null}
    </section>
  );
}
