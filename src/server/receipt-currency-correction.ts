import { convertReceiptToGbp } from "./fx-conversion";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { currencyMinorUnitDigits } from "./receipt-extraction";
import type { ReceiptIntakeRow } from "./receipt-intake-model";

export async function correctedCurrencyState(
  principal: Principal,
  row: ReceiptIntakeRow,
  originalCurrency: string,
) {
  const digits = currencyMinorUnitDigits(originalCurrency);
  if (
    digits === null ||
    !row.service_date ||
    row.original_receipt_total_minor === null ||
    row.original_eligible_minor === null
  ) {
    throw new ApiError(
      409,
      "receipt_reanalysis_required",
      "Recheck the receipt before correcting its currency.",
    );
  }
  try {
    const conversion = await convertReceiptToGbp(principal, {
      originalCurrency,
      serviceDate: row.service_date,
      originalMinorUnitDigits: digits,
      receiptTotalMinor: row.original_receipt_total_minor,
      eligibleMinor: row.original_eligible_minor,
      gratuityMinor: row.original_gratuity_minor,
    });
    return {
      originalCurrency,
      originalMinorUnitDigits: digits,
      exchangeRateQuoteId: conversion.quoteId,
      conversionJson: JSON.stringify(conversion),
      receiptTotalPence: conversion.receiptTotalPence,
      eligiblePence: conversion.eligiblePence,
      gratuityPence: conversion.gratuityPence,
    };
  } catch {
    return {
      originalCurrency,
      originalMinorUnitDigits: digits,
      exchangeRateQuoteId: null,
      conversionJson: JSON.stringify({
        status: "unavailable",
        requestedDate: row.service_date,
        originalCurrency,
        targetCurrency: "GBP",
      }),
      receiptTotalPence: null,
      eligiblePence: null,
      gratuityPence: 0,
    };
  }
}

export async function applyCorrectedCurrency(
  principal: Principal,
  row: ReceiptIntakeRow,
  originalCurrency: string,
  missing: string[],
  uncertain: string[],
  assignments: string[],
  values: unknown[],
): Promise<void> {
  const currency = await correctedCurrencyState(
    principal,
    row,
    originalCurrency,
  );
  Object.assign(row, {
    original_currency: currency.originalCurrency,
    original_minor_unit_digits: currency.originalMinorUnitDigits,
    exchange_rate_quote_id: currency.exchangeRateQuoteId,
    conversion_json: currency.conversionJson,
    receipt_total_pence: currency.receiptTotalPence,
    eligible_pence: currency.eligiblePence,
    gratuity_pence: currency.gratuityPence,
  });
  if (
    currency.receiptTotalPence !== null &&
    currency.eligiblePence !== null
  ) {
    for (const field of ["receipt_total", "eligible_amount"]) {
      const missingIndex = missing.indexOf(field);
      if (missingIndex >= 0) missing.splice(missingIndex, 1);
      const uncertainIndex = uncertain.indexOf(field);
      if (uncertainIndex >= 0) uncertain.splice(uncertainIndex, 1);
    }
    row.missing_fields_json = JSON.stringify(missing);
    row.uncertain_fields_json = JSON.stringify(uncertain);
  }
  assignments.push(
    "original_currency = ?",
    "original_minor_unit_digits = ?",
    "exchange_rate_quote_id = ?",
    "conversion_json = ?",
    "receipt_total_pence = ?",
    "eligible_pence = ?",
    "gratuity_pence = ?",
  );
  values.push(
    currency.originalCurrency,
    currency.originalMinorUnitDigits,
    currency.exchangeRateQuoteId,
    currency.conversionJson,
    currency.receiptTotalPence,
    currency.eligiblePence,
    currency.gratuityPence,
  );
}
