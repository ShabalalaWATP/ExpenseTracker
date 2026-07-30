import type {
  AiStatus,
  BatchDefaults,
  ImageEdits,
  IntakePatch,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";

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

export function normaliseReceiptIntake(value: unknown): ReceiptIntake {
  const item = record(value);
  const translationValue = record(item.translation);
  const conversionValue = record(item.conversion);
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
        };
      })
    : [];
  return {
    ...(item as unknown as ReceiptIntake),
    lineItems: lineItems as ReceiptIntake["lineItems"],
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
  };
}

export type AutoConfirmResult = {
  outcome: "confirmed" | "needs_review" | "in_progress";
  intake: ReceiptIntake;
  reasons: string[];
  expense?: unknown;
};

export class ReceiptApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ReceiptApiError";
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
    throw new ReceiptApiError(
      "The upload was interrupted. It will retry when the app is active.",
      true,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string | { message?: string };
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
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listIntakes(): Promise<ReceiptIntake[]> {
  const result = await request<Envelope<{ intakes: unknown[] }>>(
    "/api/receipt-intakes",
  );
  return result.data.intakes.map(normaliseReceiptIntake);
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
    },
  );
  return normaliseReceiptIntake(result.data.intake);
}

export async function analyseIntake(
  id: string,
  image: Blob,
  edits?: ImageEdits,
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/analysis`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        ...(edits ? { "X-Image-Edits": JSON.stringify(edits) } : {}),
      },
      body: image,
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
