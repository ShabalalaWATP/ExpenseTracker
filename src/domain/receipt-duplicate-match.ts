export type DuplicateMatchCandidate = {
  merchant: string;
  service_date: string;
  receipt_total_pence: number;
  original_currency?: string;
  original_receipt_total_minor?: number;
};

export function duplicateReason(
  candidate: DuplicateMatchCandidate,
  values: {
    merchant: string;
    serviceDate: string;
    receiptTotalPence: number;
    originalCurrency?: string;
    originalAmountMinor?: number;
  },
): string {
  if (
    candidate.service_date === values.serviceDate &&
    (candidate.original_currency ?? "GBP") ===
      (values.originalCurrency ?? "GBP") &&
    (candidate.original_receipt_total_minor ??
      candidate.receipt_total_pence) ===
      (values.originalAmountMinor ?? values.receiptTotalPence)
  ) {
    return "Same date and receipt total";
  }
  return "Same merchant and date";
}
