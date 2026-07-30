import { formatDate, formatMoney } from "../format";
import type { ReceiptIntake } from "./types";

const mealLabels = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Evening meal",
  snack: "Snack",
  mixed: "Mixed",
} as const;

export function ReceiptFactSummary({
  intake,
}: {
  intake: ReceiptIntake;
}) {
  const purchase = intake.serviceDate
    ? `${formatDate(intake.serviceDate)}${
        intake.transactionTime ? ` at ${intake.transactionTime}` : ""
      }`
    : "Needs review";
  const meal = intake.mealContext
    ? mealLabels[intake.mealContext]
    : intake.category === "food"
      ? "Not inferred"
      : "Not applicable";

  return (
    <dl className="receipt-fact-summary" aria-label="Extracted receipt facts">
      <div>
        <dt>Purchase</dt>
        <dd>{purchase}</dd>
      </div>
      <div>
        <dt>Place</dt>
        <dd>{intake.location || "Needs review"}</dd>
      </div>
      <div>
        <dt>Receipt</dt>
        <dd>
          {intake.receiptTotalPence === null
            ? "Needs review"
            : formatMoney(intake.receiptTotalPence)}
        </dd>
      </div>
      <div>
        <dt>Eligible</dt>
        <dd>
          {intake.eligiblePence === null
            ? "Needs review"
            : formatMoney(intake.eligiblePence)}
        </dd>
      </div>
      <div>
        <dt>Meal</dt>
        <dd>{meal}</dd>
      </div>
    </dl>
  );
}
