import { formatDate, formatMoney } from "../format";
import type { ReceiptIntake } from "./types";
import { InternationalReceiptFacts } from "./InternationalReceiptFacts";

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
    <>
      <InternationalReceiptFacts
        facts={intake}
        merchant={intake.merchant}
        location={intake.location}
        receiptTotalPence={intake.receiptTotalPence}
        eligiblePence={intake.eligiblePence}
        gratuityPence={intake.gratuityPence}
      />
      <dl className="receipt-fact-summary" aria-label="Extracted policy facts">
        <div>
          <dt>Purchase</dt>
          <dd>{purchase}</dd>
        </div>
        <div>
          <dt>Policy place</dt>
          <dd>{intake.translation?.locationEnglish || intake.location || "Needs review"}</dd>
        </div>
        <div>
          <dt>GBP receipt</dt>
          <dd>
            {intake.receiptTotalPence === null
              ? "Needs review"
              : formatMoney(intake.receiptTotalPence)}
          </dd>
        </div>
        <div>
          <dt>GBP eligible</dt>
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
    </>
  );
}
