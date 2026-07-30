import type { DashboardData } from "../types";
import type {
  ImageEdits,
  ReceiptAnalysisResult,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";

export type IntakeReviewProps = {
  intake: ReceiptIntake;
  data: DashboardData;
  voiceAvailable: boolean;
  canRetryAnalysis: boolean;
  canReanalyse: boolean;
  analysisBusy: boolean;
  analysisModel: string;
  onUpdate: (next: ReceiptIntake) => void;
  onRetryAnalysis: () => Promise<ReceiptAnalysisResult>;
  onReanalyse: (fields: ReceiptRecheckField[]) => Promise<ReceiptAnalysisResult>;
  onAnalyseWithEdits: (edits: ImageEdits) => Promise<ReceiptAnalysisResult>;
  onConfirmed: () => Promise<void>;
};
