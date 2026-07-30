import {
  EXPENSE_CATEGORY_OPTIONS,
  type ExpenseCategory,
  type MealContext,
} from "../types";
import type { ReceiptIntake, ReceiptRecheckField } from "./types";

type Setter = (value: string) => void;

export function IntakeEditableFacts({
  intake,
  values,
  locked,
  busy,
  canReanalyse,
  foreignReceipt,
  manualConversion,
  conversionReviewed,
  flagged,
  confidence,
  onChange,
  onReconciliationChanged,
  onConversionReviewed,
  onReanalyse,
}: {
  intake: ReceiptIntake;
  values: {
    merchant: string;
    date: string;
    total: string;
    eligible: string;
    gratuity: string;
    location: string;
    category: ExpenseCategory | "";
    meal: MealContext;
  };
  locked: boolean;
  busy: boolean;
  canReanalyse: boolean;
  foreignReceipt: boolean;
  manualConversion: boolean;
  conversionReviewed: boolean;
  flagged: (field: string) => boolean;
  confidence: (field: string) => string;
  onChange: {
    merchant: Setter;
    date: Setter;
    total: Setter;
    eligible: Setter;
    gratuity: Setter;
    location: Setter;
    category: (value: ExpenseCategory | "") => void;
    meal: (value: MealContext) => void;
  };
  onReconciliationChanged: () => void;
  onConversionReviewed: (value: boolean) => void;
  onReanalyse: (fields: ReceiptRecheckField[]) => void;
}) {
  const reread = (field: ReceiptRecheckField) =>
    canReanalyse ? (
      <button
        type="button"
        className="field-reread"
        disabled={busy}
        onClick={() => onReanalyse([field])}
      >
        Recheck
      </button>
    ) : null;
  const moneyChanged = (setter: Setter, value: string) => {
    setter(value);
    onReconciliationChanged();
  };
  const moneyLocked = locked || (foreignReceipt && !manualConversion);
  return (
    <details
      className="intake-fact-details"
      open={
        intake.missingFields.length > 0 ||
        intake.uncertainFields.length > 0
      }
    >
      <summary>Review extracted receipt facts</summary>
      <div className="intake-field-grid">
        <label className={flagged("merchant") ? "flagged" : ""}>
          <span>
            Merchant <small>{confidence("merchant")}</small>
            {reread("merchant")}
          </span>
          <input
            data-intake-review-field="merchant"
            value={values.merchant}
            onChange={(event) => onChange.merchant(event.target.value)}
            disabled={locked}
          />
        </label>
        <label className={flagged("serviceDate") ? "flagged" : ""}>
          <span>
            Date {intake.transactionTime ? `· ${intake.transactionTime}` : ""}{" "}
            <small>{confidence("serviceDate")}</small>
            {reread("service_date")}
          </span>
          <input
            data-intake-review-field="serviceDate"
            type="date"
            value={values.date}
            onChange={(event) => onChange.date(event.target.value)}
            disabled={locked || foreignReceipt}
          />
        </label>
        <label className={flagged("receiptTotalPence") ? "flagged" : ""}>
          <span>
            GBP policy receipt total{" "}
            <small>{confidence("receiptTotalPence")}</small>
            {reread("receipt_total")}
          </span>
          <div className="intake-money">
            <b>£</b>
            <input
              data-intake-review-field="receiptTotalPence"
              inputMode="decimal"
              value={values.total}
              onChange={(event) =>
                moneyChanged(onChange.total, event.target.value)
              }
              disabled={moneyLocked}
            />
          </div>
        </label>
        <label className={flagged("category") ? "flagged" : ""}>
          <span>
            Category <small>{confidence("category")}</small>
            {reread("category")}
          </span>
          <select
            value={values.category}
            onChange={(event) =>
              onChange.category(event.target.value as ExpenseCategory | "")
            }
            disabled={locked}
          >
            <option value="">Not labelled</option>
            {EXPENSE_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={flagged("eligiblePence") ? "flagged" : ""}>
          <span>
            {values.category && values.category !== "food"
              ? "GBP policy eligible amount"
              : "GBP policy eligible food and drink"}{" "}
            <small>{confidence("eligiblePence")}</small>
            {reread("eligible_amount")}
          </span>
          <div className="intake-money">
            <b>£</b>
            <input
              data-intake-review-field="eligiblePence"
              inputMode="decimal"
              value={values.eligible}
              onChange={(event) =>
                moneyChanged(onChange.eligible, event.target.value)
              }
              disabled={moneyLocked}
            />
          </div>
        </label>
        <label>
          <span>GBP policy service charge or tip</span>
          <div className="intake-money">
            <b>£</b>
            <input
              inputMode="decimal"
              value={values.gratuity}
              onChange={(event) =>
                moneyChanged(onChange.gratuity, event.target.value)
              }
              disabled={moneyLocked}
            />
          </div>
        </label>
        <label className={flagged("location") ? "flagged" : ""}>
          <span>
            Location <small>{confidence("location")}</small>
          </span>
          <input
            data-intake-review-field="location"
            value={values.location}
            onChange={(event) => onChange.location(event.target.value)}
            disabled={locked}
          />
        </label>
        {!values.category || values.category === "food" ? (
          <label>
            <span>
              Meal context <small>{confidence("mealContext")}</small>
            </span>
            <select
              value={values.meal}
              onChange={(event) =>
                onChange.meal(event.target.value as MealContext)
              }
              disabled={locked}
            >
              <option value="">Not labelled</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Evening meal</option>
              <option value="snack">Snack</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
        ) : null}
      </div>
      {foreignReceipt ? (
        <div className="wide review-message">
          {manualConversion ? (
            <label>
              <input
                type="checkbox"
                checked={conversionReviewed}
                onChange={(event) =>
                  onConversionReviewed(event.target.checked)
                }
                disabled={locked}
              />
              No official ECB rate was available. I checked the original
              receipt and supplied the GBP equivalent above.
            </label>
          ) : (
            <p>
              Original foreign facts and the dated conversion are frozen. Use
              Recheck if the printed date or amount is wrong.
            </p>
          )}
        </div>
      ) : null}
    </details>
  );
}
