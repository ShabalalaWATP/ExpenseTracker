export type FrozenReceiptConversion = {
  originalCurrency: string;
  serviceDate: string | null;
  originalReceiptTotalMinor: number | null;
  originalEligibleMinor: number | null;
  originalGratuityMinor: number;
  originalMinorUnitDigits: number | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  exchangeRateQuoteId: string | null;
  conversionJson: string;
};

export type FrozenExchangeRateQuote = {
  id: string;
  provider: string;
  baseCurrency: string;
  quoteCurrency: string;
  requestedDate: string;
  observationDate: string;
  rateNumerator: string;
  rateDenominator: string;
};

export type ExpectedGbpAmounts = {
  receiptTotalPence: number;
  eligiblePence: number;
  gratuityPence: number;
};

type StoredConversion = Partial<ExpectedGbpAmounts> & {
  status?: string;
  provider?: string;
  quoteId?: string | null;
  requestedDate?: string;
  observationDate?: string | null;
  originalCurrency?: string;
  targetCurrency?: string;
  originalMinorUnitDigits?: number;
  rateNumerator?: string;
  rateDenominator?: string;
  receiptTotalMinor?: number;
  eligibleMinor?: number;
  gratuityMinor?: number;
};

function storedConversion(value: string): StoredConversion | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as StoredConversion)
      : null;
  } catch {
    return null;
  }
}

function amountsAreSafe(row: FrozenReceiptConversion): boolean {
  return [
    row.originalReceiptTotalMinor,
    row.originalEligibleMinor,
    row.originalGratuityMinor,
    row.receiptTotalPence,
    row.eligiblePence,
    row.gratuityPence,
  ].every(
    (value) =>
      value !== null && Number.isSafeInteger(value) && Number(value) >= 0,
  );
}

function amountsMatch(
  values: Partial<ExpectedGbpAmounts>,
  row: FrozenReceiptConversion,
): boolean {
  return (
    values.receiptTotalPence === row.receiptTotalPence &&
    values.eligiblePence === row.eligiblePence &&
    values.gratuityPence === row.gratuityPence
  );
}

export function frozenReceiptConversionIssue(
  row: FrozenReceiptConversion,
  quote: FrozenExchangeRateQuote | null,
  expected: ExpectedGbpAmounts | null,
): string | null {
  if (
    !amountsAreSafe(row) ||
    row.originalMinorUnitDigits === null ||
    !Number.isInteger(row.originalMinorUnitDigits) ||
    row.originalMinorUnitDigits < 0 ||
    row.originalMinorUnitDigits > 4
  ) {
    return "The receipt contains invalid original or GBP amounts.";
  }
  const conversion = storedConversion(row.conversionJson);
  if (!conversion) return "The receipt conversion record is invalid.";

  if (row.originalCurrency === "GBP") {
    return row.exchangeRateQuoteId !== null ||
      row.originalMinorUnitDigits !== 2 ||
      row.originalReceiptTotalMinor !== row.receiptTotalPence ||
      row.originalEligibleMinor !== row.eligiblePence ||
      row.originalGratuityMinor !== row.gratuityPence
      ? "The GBP receipt values do not match the original evidence."
      : null;
  }

  if (
    conversion.status === "owner_override" &&
    conversion.provider === "owner"
  ) {
    return row.exchangeRateQuoteId !== null ||
      conversion.originalCurrency !== row.originalCurrency ||
      conversion.targetCurrency !== "GBP" ||
      conversion.requestedDate !== row.serviceDate ||
      !amountsMatch(conversion, row)
      ? "The owner-supplied GBP conversion is incomplete or inconsistent."
      : null;
  }

  if (!quote || row.exchangeRateQuoteId !== quote.id || !expected) {
    return "The official exchange-rate quote is missing or invalid.";
  }
  if (
    quote.provider !== "ECB" ||
    quote.baseCurrency !== row.originalCurrency ||
    quote.quoteCurrency !== "GBP" ||
    quote.requestedDate !== row.serviceDate ||
    conversion.provider !== "ECB" ||
    conversion.quoteId !== quote.id ||
    conversion.originalCurrency !== row.originalCurrency ||
    conversion.targetCurrency !== "GBP" ||
    conversion.requestedDate !== quote.requestedDate ||
    conversion.observationDate !== quote.observationDate ||
    conversion.rateNumerator !== quote.rateNumerator ||
    conversion.rateDenominator !== quote.rateDenominator ||
    conversion.originalMinorUnitDigits !== row.originalMinorUnitDigits ||
    conversion.receiptTotalMinor !== row.originalReceiptTotalMinor ||
    conversion.eligibleMinor !== row.originalEligibleMinor ||
    conversion.gratuityMinor !== row.originalGratuityMinor
  ) {
    return "The stored conversion does not match its official exchange-rate quote.";
  }
  return amountsMatch(expected, row)
    ? null
    : "The GBP values do not match the frozen exchange-rate calculation.";
}
