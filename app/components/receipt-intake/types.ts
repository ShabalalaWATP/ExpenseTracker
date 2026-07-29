import type { MealContext } from "../types";

export type IntakeStatus =
  | "uploaded"
  | "analysing"
  | "needs_review"
  | "ready"
  | "confirmed"
  | "failed";

export interface ReceiptLineItem {
  description: string;
  quantity: number | null;
  totalPence: number | null;
  eligible: boolean | null;
  alcoholSuspected: boolean;
  confidence?: number;
}

export interface ReceiptIntake {
  id: string;
  batchId: string;
  status: IntakeStatus;
  originalName: string;
  contentType: string;
  byteSize: number;
  previewUrl: string;
  merchant: string | null;
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  gratuityPence: number;
  location: string | null;
  businessReason: string | null;
  mealContext: MealContext | null;
  tripId: string | null;
  lineItems: ReceiptLineItem[];
  confidence: Record<string, number>;
  missingFields: string[];
  uncertainFields: string[];
  alcoholSuspected: boolean;
  alcoholReviewed: boolean;
  clarificationQuestions: string[];
  aiModel: string | null;
  hasAnalysisCopy: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiStatus {
  configured: boolean;
  models: {
    chat: string;
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
}

export interface LocalUpload {
  id: string;
  idempotencyKey: string;
  file: File;
  stage: "queued" | "uploading" | "normalising" | "failed";
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
  tripId: string | null;
  alcoholReviewed: boolean;
}>;
