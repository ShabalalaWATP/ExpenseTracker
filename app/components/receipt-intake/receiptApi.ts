import type {
  AiStatus,
  BatchDefaults,
  IntakePatch,
  ReceiptIntake,
} from "./types";

type Envelope<T> = { data: T };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string | { message?: string };
      message?: string;
    } | null;
    const message =
      typeof body?.error === "string"
        ? body.error
        : body?.error?.message ?? body?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listIntakes(): Promise<ReceiptIntake[]> {
  const result = await request<Envelope<{ intakes: ReceiptIntake[] }>>(
    "/api/receipt-intakes",
  );
  return result.data.intakes;
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
        "X-Default-Service-Date": defaults.serviceDate,
        "X-Default-Location": encodeURIComponent(defaults.location.trim()),
        "X-Default-Reason": encodeURIComponent(defaults.businessReason.trim()),
        "X-Default-Trip-Id": defaults.tripId,
        "X-Default-Meal-Context": defaults.mealContext,
      },
      body: file,
    },
  );
  return result.data.intake;
}

export async function analyseIntake(
  id: string,
  image: Blob,
): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/analysis`,
    {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: image,
    },
  );
  return result.data.intake;
}

export async function reanalyseIntake(id: string): Promise<ReceiptIntake> {
  const result = await request<Envelope<{ intake: ReceiptIntake }>>(
    `/api/receipt-intakes/${encodeURIComponent(id)}/analysis`,
    { method: "POST" },
  );
  return result.data.intake;
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
  return result.data.intake;
}

export async function confirmIntake(id: string): Promise<ReceiptIntake> {
  const result = await request<
    Envelope<{ expense: unknown; intake: ReceiptIntake }>
  >(`/api/receipt-intakes/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
  });
  return result.data.intake;
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
  return result.data.intake;
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
