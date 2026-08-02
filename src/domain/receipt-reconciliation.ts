export type ReconciliationLine = {
  totalPence: number | null;
  eligible: boolean | null;
  claimedTotalPence?: number | null;
};

export type ReceiptReconciliation = {
  status: "balanced" | "incomplete" | "mismatch";
  knownLineTotalPence: number;
  receiptDifferencePence: number | null;
  knownEligibleLineTotalPence: number;
  eligibleDifferencePence: number | null;
  unknownAmountCount: number;
  unknownEligibilityCount: number;
  issues: string[];
};

export function reconcileReceipt(
  lines: readonly ReconciliationLine[],
  receiptTotalPence: number | null,
  eligiblePence: number | null,
  gratuityPence = 0,
): ReceiptReconciliation {
  const known = lines.filter(
    (line): line is ReconciliationLine & { totalPence: number } =>
      Number.isSafeInteger(line.totalPence),
  );
  const knownLineTotalPence = known.reduce(
    (sum, line) => sum + line.totalPence,
    0,
  );
  const knownEligibleLineTotalPence = known
    .filter((line) => line.eligible === true)
    .reduce(
      (sum, line) =>
        sum +
        (Number.isSafeInteger(line.claimedTotalPence)
          ? Number(line.claimedTotalPence)
          : line.totalPence),
      0,
    );
  const unknownAmountCount = lines.length - known.length;
  const unknownEligibilityCount = known.filter(
    (line) => line.eligible === null,
  ).length;
  const receiptDifferencePence =
    receiptTotalPence === null || lines.length === 0
      ? null
      : receiptTotalPence - knownLineTotalPence;
  const eligibleDifferencePence =
    eligiblePence === null || lines.length === 0
      ? null
      : eligiblePence - knownEligibleLineTotalPence;
  const issues: string[] = [];

  if (
    receiptDifferencePence !== null &&
    receiptDifferencePence !== 0 &&
    unknownAmountCount === 0
  ) {
    issues.push("Visible line items do not add up to the receipt total.");
  }
  if (
    eligibleDifferencePence !== null &&
    eligibleDifferencePence !== 0 &&
    unknownAmountCount === 0 &&
    unknownEligibilityCount === 0
  ) {
    issues.push(
      "Eligible line items do not add up to the eligible amount.",
    );
  }
  if (
    receiptTotalPence !== null &&
    eligiblePence !== null &&
    eligiblePence > receiptTotalPence
  ) {
    issues.push("The eligible amount exceeds the receipt total.");
  }
  if (eligiblePence !== null && gratuityPence > eligiblePence) {
    issues.push("The service charge or tip exceeds the eligible amount.");
  }

  const incomplete =
    lines.length === 0 ||
    receiptTotalPence === null ||
    eligiblePence === null ||
    unknownAmountCount > 0 ||
    unknownEligibilityCount > 0;
  return {
    status: issues.length ? "mismatch" : incomplete ? "incomplete" : "balanced",
    knownLineTotalPence,
    receiptDifferencePence,
    knownEligibleLineTotalPence,
    eligibleDifferencePence,
    unknownAmountCount,
    unknownEligibilityCount,
    issues,
  };
}
