import type { ReceiptIntake } from "./types";

export type ReceiptRetrySource = "local-file" | "analysis-copy" | "original";

export function receiptRetrySource(
  intake: Pick<ReceiptIntake, "hasAnalysisCopy">,
  hasLocalFile: boolean,
): ReceiptRetrySource {
  if (hasLocalFile) return "local-file";
  return intake.hasAnalysisCopy ? "analysis-copy" : "original";
}
