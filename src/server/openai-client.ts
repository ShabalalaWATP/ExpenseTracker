import type { Principal } from "./principal";
import { ApiError } from "./http";
import {
  normaliseExtraction,
  RECEIPT_EXTRACTION_SCHEMA,
  type ReceiptExtraction,
  type ReceiptField,
} from "./receipt-extraction";
import { receiptRequestBody } from "./receipt-request";
import { runtimeConfig } from "./runtime-config";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 16_384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function openAiRequest(
  path: string,
  body: unknown,
  principal: Principal,
  purpose: "receipt" | "voice" | "audit",
): Promise<unknown> {
  const config = runtimeConfig();
  if (!config.openAiApiKey) {
    throw new ApiError(
      503,
      "openai_not_configured",
      "AI extraction is not configured yet. You can still review the receipt manually.",
    );
  }
  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": principal.actorHash,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ApiError(
      503,
      "openai_unavailable",
      purpose === "voice"
        ? "Voice is temporarily unavailable. Use the manual form instead."
        : "AI processing is temporarily unavailable. Review the receipt manually or retry.",
    );
  }
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id");
    throw new ApiError(
      response.status === 429 ? 429 : 502,
      response.status === 429 ? "openai_rate_limited" : "openai_failed",
      response.status === 429
        ? "AI is busy. Wait briefly, then retry."
        : purpose === "voice"
          ? "Voice could not start. Use the manual form instead."
          : purpose === "audit"
            ? "The AI ledger review failed. The report continues with rule-based checks."
            : "AI could not analyse this receipt. Review it manually or retry.",
      requestId ? { requestId } : undefined,
    );
  }
  return response.json();
}

export function outputText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const root = response as Record<string, unknown>;
  if (typeof root.output_text === "string") return root.output_text;
  if (!Array.isArray(root.output)) return "";
  for (const item of root.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as Record<string, unknown>).text === "string"
      ) {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return "";
}

export async function extractReceipt(
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
  principal: Principal,
  targetedFields: readonly ReceiptField[] = [],
): Promise<{ extraction: ReceiptExtraction; model: string }> {
  const config = runtimeConfig();
  const imageUrl = `data:${contentType};base64,${bytesToBase64(bytes)}`;
  const response = await openAiRequest(
    "/responses",
    receiptRequestBody(
      config.models.receipt,
      imageUrl,
      principal.actorHash,
      RECEIPT_EXTRACTION_SCHEMA,
      targetedFields,
    ),
    principal,
    "receipt",
  );
  const text = outputText(response);
  if (!text) {
    throw new ApiError(
      502,
      "openai_output_missing",
      "AI returned no usable receipt details. Review the receipt manually.",
    );
  }
  try {
    return {
      extraction: normaliseExtraction(JSON.parse(text)),
      model:
        response &&
        typeof response === "object" &&
        typeof (response as Record<string, unknown>).model === "string"
          ? ((response as Record<string, unknown>).model as string)
          : config.models.receipt,
    };
  } catch {
    throw new ApiError(
      502,
      "openai_output_invalid",
      "AI returned unreadable receipt details. Review the receipt manually.",
    );
  }
}

export async function createRealtimeClientSecret(
  principal: Principal,
  questions: string[],
  field: ReceiptField,
) {
  if (questions.length === 0) {
    throw new ApiError(
      409,
      "clarification_not_needed",
      "This receipt does not need a voice clarification.",
    );
  }
  const config = runtimeConfig();
  const fields = questions.map((question, index) => `${index + 1}. ${question}`);
  const toolField = clarificationToolField(field);
  if (!toolField) {
    throw new ApiError(
      409,
      "clarification_not_supported",
      "Type this receipt detail instead.",
    );
  }
  const response = await openAiRequest(
    "/realtime/client_secrets",
    {
      session: {
        type: "realtime",
        model: config.models.realtime,
        instructions: [
          "You are the ExpenseTracker receipt clarification assistant.",
          "Ask only the listed unresolved questions, one at a time.",
          "Do not ask for unrelated information or make allowance decisions.",
          "When answered, call submit_clarification once with only facts the user provided.",
          "Keep spoken responses short and use UK English.",
          ...fields,
        ].join("\n"),
        audio: {
          input: {
            transcription: {
              model: config.models.transcription,
              language: "en",
            },
          },
          output: { voice: config.realtimeVoice },
        },
        tools: [
          {
            type: "function",
            name: "submit_clarification",
            description:
              "Submit only the clarified receipt facts explicitly provided by the user.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: { [toolField.name]: toolField.schema },
              required: [toolField.name],
            },
          },
        ],
        tool_choice: "auto",
      },
    },
    principal,
    "voice",
  );
  if (!response || typeof response !== "object") {
    throw new ApiError(502, "realtime_invalid", "Voice could not be started.");
  }
  const value = (response as Record<string, unknown>).value;
  if (typeof value !== "string" || !value.startsWith("ek_")) {
    throw new ApiError(502, "realtime_invalid", "Voice could not be started.");
  }
  return {
    value,
    model: config.models.realtime,
    voice: config.realtimeVoice,
    questions,
  };
}

function clarificationToolField(field: ReceiptField): {
  name: string;
  schema: Record<string, unknown>;
} | null {
  const fields: Partial<Record<
    ReceiptField,
    { name: string; schema: Record<string, unknown> }
  >> = {
    merchant: { name: "merchant", schema: { type: "string", minLength: 1 } },
    service_date: {
      name: "serviceDate",
      schema: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
    receipt_total: {
      name: "receiptTotalPence",
      schema: { type: "integer", minimum: 1 },
    },
    eligible_amount: {
      name: "eligiblePence",
      schema: { type: "integer", minimum: 1 },
    },
    location: { name: "location", schema: { type: "string", minLength: 1 } },
    business_reason: {
      name: "businessReason",
      schema: { type: "string", minLength: 1 },
    },
    alcohol: { name: "alcoholReviewed", schema: { type: "boolean" } },
    category: {
      name: "category",
      schema: {
        type: "string",
        enum: ["food", "taxi", "public_transport", "parking", "other"],
      },
    },
  };
  return fields[field] ?? null;
}
