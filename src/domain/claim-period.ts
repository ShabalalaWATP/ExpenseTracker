export type ConfirmedClaimExpense = {
  eligiblePence: number;
};

export type PendingClaimReceipt = {
  eligiblePence: number | null;
};

export type ClaimPeriodCalculation = {
  qualifyingActualPence: number;
  claimablePence: number;
};

export function claimPeriodFigures(
  confirmedExpenses: readonly ConfirmedClaimExpense[],
  pendingReceipts: readonly PendingClaimReceipt[],
  calculation: ClaimPeriodCalculation,
) {
  const confirmedEligiblePence = confirmedExpenses.reduce(
    (sum, expense) => sum + Math.max(0, expense.eligiblePence),
    0,
  );
  return {
    pendingReceiptCount: pendingReceipts.length,
    pendingEstimatedEligiblePence: pendingReceipts.reduce(
      (sum, receipt) => sum + Math.max(0, receipt.eligiblePence ?? 0),
      0,
    ),
    confirmedEligiblePence,
    policyEligiblePence: calculation.qualifyingActualPence,
    claimablePence: calculation.claimablePence,
    overLimitPence: Math.max(
      0,
      calculation.qualifyingActualPence - calculation.claimablePence,
    ),
    blockedConfirmedPence: Math.max(
      0,
      confirmedEligiblePence - calculation.qualifyingActualPence,
    ),
  };
}
