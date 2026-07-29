export type DuplicateMatchCandidate = {
  merchant: string;
  service_date: string;
  receipt_total_pence: number;
};

export function duplicateReason(
  candidate: DuplicateMatchCandidate,
  values: {
    merchant: string;
    serviceDate: string;
    receiptTotalPence: number;
  },
): string {
  if (
    candidate.service_date === values.serviceDate &&
    candidate.receipt_total_pence === values.receiptTotalPence
  ) {
    return "Same date and receipt total";
  }
  return "Same merchant and date";
}
