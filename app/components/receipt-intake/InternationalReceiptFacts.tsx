import {
  countryName,
  formatCurrencyMinor,
  formatMoney,
} from "../format";
import type { OriginalReceiptFacts } from "../types";

type InternationalReceiptFactsProps = {
  facts: OriginalReceiptFacts;
  merchant?: string | null;
  location?: string | null;
  receiptTotalPence?: number | null;
  eligiblePence?: number | null;
  gratuityPence?: number | null;
  compact?: boolean;
};

function translatedValue(
  original: string | null | undefined,
  translated: string | undefined,
) {
  if (!translated || translated.trim() === original?.trim()) return null;
  return translated;
}

export function InternationalReceiptFacts({
  facts,
  merchant,
  location,
  receiptTotalPence,
  eligiblePence,
  gratuityPence,
  compact = false,
}: InternationalReceiptFactsProps) {
  const currency = facts.originalCurrency ?? "GBP";
  const digits = facts.originalMinorUnitDigits ?? 2;
  const hasOriginalFacts =
    facts.originalReceiptTotalMinor !== undefined ||
    facts.originalEligibleMinor !== undefined ||
    facts.originalGratuityMinor !== undefined ||
    Boolean(facts.originalCurrency || facts.originalCountry);
  if (!hasOriginalFacts) return null;

  const merchantEnglish = translatedValue(
    merchant,
    facts.translation?.merchantEnglish,
  );
  const locationEnglish = translatedValue(
    location,
    facts.translation?.locationEnglish,
  );

  return (
    <section
      className={`international-receipt ${compact ? "compact" : ""}`}
      aria-label="Original receipt and GBP policy values"
    >
      <div className="original-receipt-heading">
        <div>
          <p className="eyebrow">Authoritative receipt</p>
          <h4>Original values</h4>
        </div>
        <span>
          {countryName(facts.originalCountry)} · {currency}
          {facts.originalLanguage
            ? ` · ${facts.originalLanguage.toUpperCase()}`
            : ""}
        </span>
      </div>

      {(merchant || location) && (
        <dl className="original-text-facts">
          {merchant ? (
            <div>
              <dt>Merchant</dt>
              <dd>{merchant}</dd>
              {merchantEnglish ? <small>{merchantEnglish}</small> : null}
            </div>
          ) : null}
          {location ? (
            <div>
              <dt>Place</dt>
              <dd>{location}</dd>
              {locationEnglish ? <small>{locationEnglish}</small> : null}
            </div>
          ) : null}
        </dl>
      )}
      {facts.translation?.summaryEnglish ? (
        <p className="receipt-translation-summary">
          <strong>English summary</strong>
          <span>{facts.translation.summaryEnglish}</span>
        </p>
      ) : null}

      <dl className="original-money-facts">
        <div>
          <dt>Receipt total</dt>
          <dd>
            {formatCurrencyMinor(
              facts.originalReceiptTotalMinor,
              currency,
              digits,
            )}
          </dd>
        </div>
        <div>
          <dt>Eligible</dt>
          <dd>
            {formatCurrencyMinor(
              facts.originalEligibleMinor,
              currency,
              digits,
            )}
          </dd>
        </div>
        {facts.originalGratuityMinor !== undefined ? (
          <div>
            <dt>Tip or service</dt>
            <dd>
              {formatCurrencyMinor(
                facts.originalGratuityMinor,
                currency,
                digits,
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="gbp-policy-values">
        <p>
          <strong>Frozen GBP policy equivalent</strong>
          <span>Used by the allowance ledger</span>
        </p>
        <dl>
          <div>
            <dt>Receipt</dt>
            <dd>{formatMoney(receiptTotalPence ?? undefined)}</dd>
          </div>
          <div>
            <dt>Eligible</dt>
            <dd>{formatMoney(eligiblePence ?? undefined)}</dd>
          </div>
          {gratuityPence !== null && gratuityPence !== undefined ? (
            <div>
              <dt>Tip</dt>
              <dd>{formatMoney(gratuityPence)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {facts.conversion ? (
        <dl className="conversion-provenance">
          <div>
            <dt>Rate</dt>
            <dd>{facts.conversion.rateDisplay || "Recorded rate"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{facts.conversion.source || "Recorded provider"}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{facts.conversion.observationDate || "Date not supplied"}</dd>
          </div>
          {facts.conversion.providerReference ? (
            <div>
              <dt>Reference</dt>
              <dd>{facts.conversion.providerReference}</dd>
            </div>
          ) : null}
          {facts.conversion.rounding ? (
            <div>
              <dt>Rounding</dt>
              <dd>{facts.conversion.rounding}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
