import type { ReceiptIntake } from "./types";

export function IntakeOriginFallback({
  intake,
  currency,
  country,
  locked,
  onCurrencyChange,
  onCountryChange,
}: {
  intake: ReceiptIntake;
  currency: string;
  country: string;
  locked: boolean;
  onCurrencyChange: (value: string) => void;
  onCountryChange: (value: string) => void;
}) {
  if (
    intake.originalCurrency !== "UNKNOWN" &&
    intake.originalCountry !== "UNKNOWN"
  ) {
    return null;
  }
  return (
    <section className="review-message" aria-label="Receipt origin fallback">
      <p>
        The receipt reader could not identify every origin detail. Correct
        only the missing code, then ExpenseTracker will retry the dated GBP
        conversion automatically.
      </p>
      <div className="intake-field-grid">
        {intake.originalCurrency === "UNKNOWN" ? (
          <label>
            <span>Currency code</span>
            <input
              value={currency === "UNKNOWN" ? "" : currency}
              onChange={(event) =>
                onCurrencyChange(
                  event.target.value.toUpperCase().slice(0, 3),
                )
              }
              placeholder="EUR"
              pattern="[A-Z]{3}"
              maxLength={3}
              required
              disabled={locked}
            />
          </label>
        ) : null}
        {intake.originalCountry === "UNKNOWN" ? (
          <label>
            <span>Country code</span>
            <input
              value={country === "UNKNOWN" ? "" : country}
              onChange={(event) =>
                onCountryChange(
                  event.target.value.toUpperCase().slice(0, 2),
                )
              }
              placeholder="FR"
              pattern="[A-Z]{2}"
              maxLength={2}
              required
              disabled={locked}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
