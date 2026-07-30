import type {
  ExpenseCategory,
  MealContext,
  OriginalReceiptFacts,
} from "../types";

export type IntakeStatus =
  | "uploaded"
  | "analysing"
  | "needs_review"
  | "ready"
  | "confirmed"
  | "failed";

export type ReceiptAnalysisResult = "completed" | "pending" | "failed";

export type ReceiptRecheckField =
  | "merchant"
  | "service_date"
  | "transaction_time"
  | "receipt_total"
  | "eligible_amount"
  | "location"
  | "business_reason"
  | "meal_context"
  | "alcohol"
  | "category";

export interface ReceiptLineItem {
  description: string;
  descriptionEnglish?: string;
  originalDescription?: string;
  quantity: number | null;
  totalPence: number | null;
  originalTotalMinor?: number | null;
  eligible: boolean | null;
  alcoholSuspected: boolean;
  confidence?: number;
}

export interface DuplicateCandidate {
  id: string;
  kind: "expense" | "intake";
  merchant: string;
  serviceDate: string;
  receiptTotalPence: number;
  reason: string;
}

export interface ImageEdits {
  rotation: 0 | 90 | 180 | 270;
  contrast: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
}

export interface AnalysisHistoryEntry {
  analysedAt: string;
  model: string;
  targetedFields: string[];
  extraction: {
    merchant: string | null;
    serviceDate: string | null;
    transactionTime: string | null;
    receiptTotalPence: number | null;
    eligiblePence: number | null;
    gratuityPence: number;
    businessReason: string | null;
    mealContext: MealContext | null;
  };
}

export interface ReceiptIntake extends OriginalReceiptFacts {
  id: string;
  batchId: string;
  status: IntakeStatus;
  originalName: string;
  contentType: string;
  byteSize: number;
  previewUrl: string;
  merchant: string | null;
  serviceDate: string | null;
  transactionTime: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  location: string | null;
  businessReason: string | null;
  mealContext: MealContext | null;
  category: ExpenseCategory | null;
  originalCurrency: string;
  originalCountry: string;
  tripId: string | null;
  tripLegId: string | null;
  tripMatchStatus: "none" | "automatic" | "explicit" | "ambiguous";
  tripMatchException: string | null;
  lineItems: ReceiptLineItem[];
  confidence: Record<string, number>;
  missingFields: string[];
  uncertainFields: string[];
  alcoholSuspected: boolean;
  alcoholReviewed: boolean;
  analysisHistory: AnalysisHistoryEntry[];
  correctionProvenance: Record<string, "ai" | "owner" | "auto">;
  duplicateCandidates: DuplicateCandidate[];
  duplicateReviewed: boolean;
  reconciliationReviewed: boolean;
  imageEdits: Partial<ImageEdits>;
  clarificationQuestions: string[];
  aiModel: string | null;
  hasAnalysisCopy: boolean;
  errorCode: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiStatus {
  configured: boolean;
  models: {
    receipt: string;
    realtime: string;
    transcription: string;
  };
  voice: string;
  privacy: string;
}

export interface BatchDefaults {
  serviceDate: string;
  location: string;
  businessReason: string;
  tripId: string;
  mealContext: MealContext;
  category: ExpenseCategory | "";
}

export interface LocalUpload {
  id: string;
  intakeId?: string;
  idempotencyKey: string;
  batchId: string;
  defaults: BatchDefaults;
  file: File;
  stage: "queued" | "waiting-online" | "uploading" | "normalising" | "failed";
  attempts: number;
  error?: string;
}

export type IntakePatch = Partial<{
  merchant: string | null;
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  location: string | null;
  businessReason: string | null;
  mealContext: MealContext | null;
  category: ExpenseCategory | null;
  originalCurrency: string;
  originalCountry: string;
  tripId: string | null;
  tripLegId: string | null;
  leaveTripUnlinked: boolean;
  alcoholReviewed: boolean;
  duplicateReviewed: boolean;
  reconciliationReviewed: boolean;
  conversionReviewed: boolean;
}>;
