import {
  ApiError,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { consumeAiQuota } from "@/src/server/ai-quota";
import { createRealtimeClientSecret } from "@/src/server/openai-client";
import { requirePrincipal } from "@/src/server/principal";
import { createTripRealtimeClientSecret } from "@/src/server/trip-realtime";
import {
  publicIntake,
  unresolvedFields,
} from "@/src/server/receipt-intake-model";
import { requireIntake } from "@/src/server/receipt-intake-repository";
import { assertId } from "@/src/server/validation";

function intakeId(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "validation_failed", "The receipt is required.");
  }
  const id = (value as Record<string, unknown>).intakeId;
  if (typeof id !== "string") {
    throw new ApiError(400, "validation_failed", "The receipt is required.");
  }
  return assertId(id);
}

function isTripCreation(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).mode === "trip_creation",
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const input = await readJson(request);
    if (isTripCreation(input)) {
      await consumeAiQuota(principal, "realtimeSession", "trip-creation");
      return json(await createTripRealtimeClientSecret(principal), 201);
    }
    const id = intakeId(input);
    const row = await requireIntake(principal, id);
    const intake = publicIntake(row);
    const field = unresolvedFields(row)[0];
    if (!field) {
      throw new ApiError(
        409,
        "clarification_not_needed",
        "This receipt does not need a voice clarification.",
      );
    }
    await consumeAiQuota(principal, "realtimeSession", id);
    const session = await createRealtimeClientSecret(
      principal,
      intake.clarificationQuestions.slice(0, 1),
      field,
    );
    return json(session, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
