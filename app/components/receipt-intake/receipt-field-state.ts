import type { ReceiptIntake } from "./types";

const fieldName: Record<string, string> = {
  serviceDate: "service_date",
  receiptTotalPence: "receipt_total",
  eligiblePence: "eligible_amount",
  businessReason: "business_reason",
};

const confidenceName: Record<string, string[]> = {
  serviceDate: ["serviceDate", "service_date"],
  receiptTotalPence: ["receiptTotal", "receipt_total"],
  eligiblePence: ["eligibleAmount", "eligible_amount"],
};

export function fieldFlagged(
  intake: ReceiptIntake,
  field: string,
): boolean {
  const apiField = fieldName[field] ?? field;
  return (
    intake.missingFields.includes(apiField) ||
    intake.uncertainFields.includes(apiField)
  );
}

export function confidenceLabel(
  intake: ReceiptIntake,
  field: string,
): string {
  const names = confidenceName[field] ?? [field];
  const value = names
    .map((name) => intake.confidence[name])
    .find((candidate) => typeof candidate === "number");
  if (typeof value !== "number") return "Missing";
  const percent = Math.round(value <= 1 ? value * 100 : value);
  return `${percent >= 82 ? "High" : "Check"} · ${percent}%`;
}
