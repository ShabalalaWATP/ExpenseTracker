import type {
  AiStatus,
  AnalysisHistoryEntry,
  BatchDefaults,
  ImageEdits,
  IntakePatch,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";
// @ts-expect-error Direct Node tests require the source extension.
import {
  normaliseMultiReceipt,
  normaliseReceiptDocuments,
} from "./multi-receipt-normalisation.ts";

type Envelope<T> = { data: T };
type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? (value as number) : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function analysisHistory(value: unknown): AnalysisHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const entry = record(candidate);
    const extraction = record(entry.extraction);
    const analysedAt = text(entry.analysedAt);
    const model = text(entry.model);
    if (!analysedAt || !model) return [];
    return [{
      analysedAt,
      model,
      targetedFields: stringArray(entry.targetedFields),
      extraction: extraction as AnalysisHistoryEntry["extraction"],
    }];
  });
}

export function normaliseReceiptIntake(value: unknown): ReceiptIntake {
  const item = record(value);
  const translationValue = record(item.translation);
  const conversionValue = record(item.conversion);
  const groupReceiptValue = record(item.groupReceipt);
  const receiptDocuments = normaliseReceiptDocuments(item.receiptDocuments);
  const translation = {
    merchantEnglish: text(
      translationValue.merchantEnglish ?? translationValue.merchant,
    ),
    locationEnglish: text(
      translationValue.locationEnglish ?? translationValue.locationHint,
    ),
    summaryEnglish: text(
      translationValue.summaryEnglish ?? translationValue.businessReason,
    ),
  };
  const conversion = {
    status: text(conversionValue.status),
    source: text(conversionValue.source ?? conversionValue.provider) ?? "",
    observationDate: text(conversionValue.observationDate) ?? "",
    rateDisplay: text(conversionValue.rateDisplay) ?? "",
    providerReference: text(conversionValue.providerReference) ?? "",
    rounding: text(conversionValue.rounding) ?? "",
  };
  const translatedDescriptions = Array.isArray(
    translationValue.lineItemDescriptions,
  )
    ? translationValue.lineItemDescriptions
    : [];
  const lineItems = Array.isArray(item.lineItems)
    ? item.lineItems.map((line, index) => {
        const entry = record(line);
        return {
          ...entry,
          description: text(entry.description) ?? "",
          descriptionEnglish:
            text(entry.descriptionEnglish) ??
            text(translatedDescriptions[index]),
          originalDescription:
            text(entry.originalDescription) ?? text(entry.description),
          originalTotalMinor:
            optionalInteger(entry.originalTotalMinor) ??
            optionalInteger(entry.totalMinor) ??
            optionalInteger(entry.totalPence),
          documentIndex: optionalInteger(entry.documentIndex) ?? 1,
        };
      })
    : [];
  return {
    ...(item as unknown as ReceiptIntake),
    lineItems: lineItems as ReceiptIntake["lineItems"],
    receiptDocuments,
    multiReceipt: normaliseMultiReceipt(
      item.multiReceipt,
      receiptDocuments.length,
    ),
    analysisHistory: analysisHistory(item.analysisHistory),
    clarificationQuestions: stringArray(item.clarificationQuestions),
    duplicateCandidates: Array.isArray(item.duplicateCandidates)
      ? (item.duplicateCandidates as ReceiptIntake["duplicateCandidates"])
      : [],
    missingFields: stringArray(item.missingFields),
    uncertainFields: stringArray(item.uncertainFields),
    confidence: record(item.confidence) as ReceiptIntake["confidence"],
    correctionProvenance: record(
      item.correctionProvenance,
    ) as ReceiptIntake["correctionProvenance"],
    imageEdits: record(item.imageEdits) as ReceiptIntake["imageEdits"],
    errorCode: text(item.errorCode) ?? null,
    originalCurrency: text(item.originalCurrency) ?? "UNKNOWN",
    originalCountry: text(item.originalCountry) ?? "UNKNOWN",
    originalLanguage: text(item.originalLanguage),
    originalReceiptTotalMinor: optionalInteger(item.originalReceiptTotalMinor),
    originalEligibleMinor: optionalInteger(item.originalEligibleMinor),
    originalGratuityMinor: optionalInteger(item.originalGratuityMinor),
    originalMinorUnitDigits: optionalInteger(item.originalMinorUnitDigits),
    translation: Object.values(translation).some(Boolean)
      ? translation
      : undefined,
    conversion: Object.values(conversion).some(Boolean)
      ? conversion
      : undefined,
    tripLegId: text(item.tripLegId) ?? null,
    groupReceipt: {
      likelyShared: groupReceiptValue.likelyShared === true,
      pending: groupReceiptValue.pending === true,
      reviewed: groupReceiptValue.reviewed === true,
      decision:
        groupReceiptValue.decision === "single" ||
        groupReceiptValue.decision === "shared"
          ? groupReceiptValue.decision
          : null,
      selectedItems: Array.isArray(groupReceiptValue.selectedItems)
        ? groupReceiptValue.selectedItems.filter(
            (index): index is number => Number.isSafeInteger(index),
          )
        : [],
      selectedQuantities: Array.isArray(groupReceiptValue.selectedQuantities)
        ? groupReceiptValue.selectedQuantities.filter(
            (quantity): quantity is number =>
              Number.isSafeInteger(quantity) && Number(quantity) >= 0,
          )
        : [],
      peopleCount:
        optionalInteger(groupReceiptValue.peopleCount) ??
        optionalInteger(groupReceiptValue.estimatedPeople) ??
        2,
      allocationMethod:
        groupReceiptValue.allocationMethod === "equal" ? "equal" : "items",
      estimatedPeople:
        optionalInteger(groupReceiptValue.estimatedPeople) ?? 1,
      reason: text(groupReceiptValue.reason) ?? null,
    },
  };
}

export type AutoConfirmResult = {
  outcome: "confirmed" | "needs_review" | "in_progress";
  intake: ReceiptIntake;
  reasons: string[];
  expense?: unknown;
};

export class ReceiptApiError extends Error {
  readonly retryable: boolean;
  readonly code?: string;

  constructor(message: string, retryable: boolean, code?: string) {
    super(message);
    this.name = "ReceiptApiError";
    this.retryable = retryable;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    if (init?.signal?.aborted) {
      throw new ReceiptApiError(
        "Processing was cancelled. Any secured original remains in your inbox.",
        false,
        "request_cancelled",
      );
    }
    throw new ReceiptApiError(
      "The request was interrupted. It will retry when the app is active.",
      true,
      "request_interrupted",
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string | { code?: string; message?: string };
      code?: string;
      message?: string;
    } | null;
    const message =
      typeof body?.error === "string"
        ? body.error
        : body?.error?.message ?? body?.message;
    throw new ReceiptApiError(
      message || `Request failed (${response.status})`,
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
      typeof body?.error === "object"
        ? body.error.code
        : body?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listIntakes(
  signal?: AbortSignal,
): Promise<ReceiptIntake[]> {
  const result = await request<Envelope<{ intakes: unknown[] }>>(
    "/api/receipt-intakes",
    { signal },
  );
  return result.data.intakes.map(normaliseReceiptIntake);
}

export async function getIntake(id: string): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}`,
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function getAiStatus(): Promise<AiStatus> {
  const result = await request<Envelope<AiStatus>>("/api/ai/status");
  return result.data;
}

export async function uploadIntake(
  file: File,
  batchId: string,
  defaults: BatchDefaults,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    "/api/receipt-intakes",
    {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Batch-Id": batchId,
        "X-File-Name": encodeURIComponent(file.name),
        "Idempotency-Key": idempotencyKey,
        "X-Default-Reason": encodeURIComponent(defaults.businessReason.trim()),
        "X-Default-Trip-Id": defaults.tripId,
      },
      body: file,
      signal,
    },
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function analyseIntake(
  id: string,
  image: Blob,
  edits?: ImageEdits,
  signal?: AbortSignal,
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/analysis`,
    {
      method: "PUT",
      headers: {
        "Content-Type":
          image.type === "image/png" ? "image/png" : "image/jpeg",
        ...(edits ? { "X-Image-Edits": JSON.stringify(edits) } : {}),
      },
      body: image,
      signal,
    },
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function reanalyseIntake(
  id: string,
  fields: readonly ReceiptRecheckField[] = [],
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/analysis`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function patchIntake(
  id: string,
  fields: IntakePatch,
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    },
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function confirmIntake(
  id: string,
  attested: boolean,
): Promise<ReceiptIntake> {
  const result = await request<
    Envelope<{ expense: unknown; intake: ReceiptIntake }>
  >(`/api/receipt-intakes/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attested }),
  });
  return normaliseReceiptIntake(result.data.intake);
}

export async function autoConfirmIntake(id: string): Promise<AutoConfirmResult> {
  const result = await request<Envelope<AutoConfirmResult>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/auto-confirm`, {
    method: "POST",
  });
  return {
    ...result.data,
    intake: normaliseReceiptIntake(result.data.intake),
  };
}

export async function deleteIntake(id: string): Promise<void> {
  await request(`/api/receipt-intakes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function submitClarification(
  id: string,
  fields: Record<string, unknown>,
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/clarifications`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    },
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function createRealtimeSession(
  intakeId: string,
): Promise<{
  value: string;
  model: string;
  voice: string;
  questions: string[];
}> {
  const result = await request<
    Envelope<{
      value: string;
      model: string;
      voice: string;
      questions: string[];
    }>
  >("/api/ai/realtime-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intakeId }),
  });
  return result.data;
}
