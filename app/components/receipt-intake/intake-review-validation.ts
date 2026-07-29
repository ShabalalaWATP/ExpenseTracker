import { parsePence } from "../format";

export function validateIntakeReview(input: {
  merchant: string;
  date: string;
  location: string;
  reason: string;
  total: string;
  eligible: string;
  gratuity: string;
}): string {
  const receiptTotal = parsePence(input.total);
  const eligibleTotal = parsePence(input.eligible);
  const gratuityTotal = parsePence(input.gratuity);
  if (
    !input.merchant.trim() ||
    !input.date ||
    !input.location.trim() ||
    !input.reason.trim()
  ) {
    return "Complete the merchant, date, location and business reason.";
  }
  if (!receiptTotal || receiptTotal < 1 || !eligibleTotal || eligibleTotal < 1) {
    return "Enter valid receipt and eligible totals.";
  }
  if (!Number.isSafeInteger(gratuityTotal) || gratuityTotal < 0) {
    return "Enter a valid service charge or tip.";
  }
  if (eligibleTotal > receiptTotal) {
    return "The eligible amount cannot exceed the receipt total.";
  }
  if (gratuityTotal > eligibleTotal) {
    return "The service charge or tip cannot exceed the eligible amount.";
  }
  return "";
}
