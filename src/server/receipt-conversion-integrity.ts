import { database } from "./db";
import {
  convertMinorToPence,
  reduceRate,
} from "./fx-reference";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import {
  frozenReceiptConversionIssue,
  type FrozenExchangeRateQuote,
} from "./receipt-conversion-policy";
import type { ReceiptIntakeRow } from "./receipt-intake-model";

type QuoteRow = {
  id: string;
  provider: string;
  base_currency: string;
  quote_currency: string;
  requested_date: string;
  observation_date: string;
  rate_numerator: string;
  rate_denominator: string;
};

function publicQuote(row: QuoteRow | null): FrozenExchangeRateQuote | null {
  return row
    ? {
        id: row.id,
        provider: row.provider,
        baseCurrency: row.base_currency,
        quoteCurrency: row.quote_currency,
        requestedDate: row.requested_date,
        observationDate: row.observation_date,
        rateNumerator: row.rate_numerator,
        rateDenominator: row.rate_denominator,
      }
    : null;
}

export async function assertReceiptConversionIntegrity(
  principal: Principal,
  row: ReceiptIntakeRow,
): Promise<void> {
  const quote = row.exchange_rate_quote_id
    ? await database()
        .prepare(
          `SELECT id, provider, base_currency, quote_currency, requested_date,
                  observation_date, rate_numerator, rate_denominator
           FROM exchange_rate_quotes
           WHERE owner_id = ? AND id = ?`,
        )
        .bind(principal.ownerId, row.exchange_rate_quote_id)
        .first<QuoteRow>()
    : null;
  const issue = frozenReceiptConversionIssue(
    {
      originalCurrency: row.original_currency,
      serviceDate: row.service_date,
      originalReceiptTotalMinor: row.original_receipt_total_minor,
      originalEligibleMinor: row.original_eligible_minor,
      originalGratuityMinor: row.original_gratuity_minor,
      originalMinorUnitDigits: row.original_minor_unit_digits,
      receiptTotalPence: row.receipt_total_pence,
      eligiblePence: row.eligible_pence,
      gratuityPence: row.gratuity_pence,
      exchangeRateQuoteId: row.exchange_rate_quote_id,
      conversionJson: row.conversion_json,
    },
    publicQuote(quote),
    quote &&
      row.original_receipt_total_minor !== null &&
      row.original_eligible_minor !== null &&
      row.original_minor_unit_digits !== null
      ? (() => {
          try {
            const rate = reduceRate({
              numerator: BigInt(quote.rate_numerator),
              denominator: BigInt(quote.rate_denominator),
            });
            const convert = (amount: number) =>
              convertMinorToPence(
                amount,
                row.original_minor_unit_digits!,
                rate,
              );
            return {
              receiptTotalPence: convert(
                row.original_receipt_total_minor!,
              ),
              eligiblePence: convert(row.original_eligible_minor!),
              gratuityPence: convert(row.original_gratuity_minor),
            };
          } catch {
            return null;
          }
        })()
      : null,
  );
  if (issue) {
    throw new ApiError(409, "receipt_conversion_invalid", issue);
  }
}
