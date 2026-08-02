import { parsePence } from "../format";
import { CorrectionHistory } from "./CorrectionHistory";
import { DuplicateReview } from "./DuplicateReview";
import { ReceiptLineItems } from "./ReceiptLineItems";
import { GroupReceiptReview } from "./GroupReceiptReview";
import { ReconciliationCard } from "./ReconciliationCard";
import type { ReceiptIntake } from "./types";

export function IntakeReviewEvidence({
  intake,
  total,
  eligible,
  gratuity,
  reconciliationReviewed,
  duplicateReviewed,
  locked,
  onReconciliationReviewed,
  onDuplicateReviewed,
  groupReceiptDecision,
  onGroupReceiptDecision,
  onEligibleAmount,
}: {
  intake: ReceiptIntake;
  total: string;
  eligible: string;
  gratuity: string;
  reconciliationReviewed: boolean;
  duplicateReviewed: boolean;
  locked: boolean;
  onReconciliationReviewed: (value: boolean) => void;
  onDuplicateReviewed: (value: boolean) => void;
  groupReceiptDecision: "single" | "shared" | null;
  onGroupReceiptDecision: (value: "single" | "shared") => void;
  onEligibleAmount: (value: string, selectedItems: number[]) => void;
}) {
  return (
    <>
      <GroupReceiptReview
        intake={intake}
        decision={groupReceiptDecision}
        locked={locked}
        onDecision={onGroupReceiptDecision}
        onEligibleAmount={onEligibleAmount}
      />
      <ReceiptLineItems
        items={intake.lineItems}
        currency={intake.originalCurrency}
        minorUnitDigits={intake.originalMinorUnitDigits}
      />
      <ReconciliationCard
        lineItems={intake.lineItems}
        receiptTotalPence={
          intake.originalReceiptTotalMinor ?? parsePence(total)
        }
        eligiblePence={
          intake.originalEligibleMinor ?? parsePence(eligible)
        }
        gratuityPence={
          intake.originalGratuityMinor ?? parsePence(gratuity)
        }
        currency={intake.originalCurrency}
        minorUnitDigits={intake.originalMinorUnitDigits}
        reviewed={reconciliationReviewed}
        onReviewed={onReconciliationReviewed}
        locked={locked}
      />
      <DuplicateReview
        candidates={intake.duplicateCandidates}
        reviewed={duplicateReviewed}
        onReviewed={onDuplicateReviewed}
        locked={locked}
      />
      <CorrectionHistory entries={intake.analysisHistory} />
    </>
  );
}
