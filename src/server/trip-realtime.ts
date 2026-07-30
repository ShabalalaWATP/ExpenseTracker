import { TRIP_VOICE_DRAFT_SCHEMA } from "@/src/domain/trip-voice";
import { ApiError } from "./http";
import { openAiRequest } from "./openai-client";
import type { Principal } from "./principal";
import { runtimeConfig } from "./runtime-config";

export function tripRealtimeSessionBody(config = runtimeConfig()) {
  return {
    session: {
      type: "realtime",
      model: config.models.realtime,
      instructions: [
        "You are the ExpenseTracker trip creation assistant.",
        "Understand the user's speech in any language. Reply briefly in the language they are using. When speaking English, use UK English.",
        "Collect: trip title, overall start and end dates, every itinerary stop with its nation and inclusive dates, calculation method, and eligible dates.",
        "Represent each nation as its canonical upper-case two-letter country code. Never invent or infer a nation, stop, or transition date.",
        "Collect all stops in chronological order. Adjacent stops may share one same-day transition, but otherwise the next stop starts the following day.",
        "Daily applies the £30 limit separately to each eligible date. Aggregate pools actual spend and is available only for trips of at least two nights.",
        "Eligibility means: the absence exceeded five hours, arose from authorised duty, and equivalent food was not provided at public expense.",
        "Accept facts in any order. If a value is missing, ambiguous, contradictory, or invalid, ask one precise follow-up question.",
        "After each useful answer, call update_trip_draft with the complete current draft. Use null for facts not yet known and never invent values.",
        "When every field is valid, read the complete itinerary aloud in order, including every stop, nation, date range, eligible dates and method, then ask the equivalent of: Shall I save this trip? in the user's language.",
        "Call confirm_trip only after the user explicitly says yes to that save question. Silence, uncertainty, corrections, and earlier eligibility confirmation are not save confirmation.",
        "If the user corrects anything, update the draft, read the revised summary, and ask for save confirmation again.",
      ].join("\n"),
      audio: {
        input: {
          transcription: {
            model: config.models.transcription,
          },
        },
        output: { voice: config.realtimeVoice },
      },
      tools: [
        {
          type: "function",
          name: "update_trip_draft",
          description:
            "Replace the structured trip draft after the user provides or corrects a fact. This never saves the trip.",
          strict: true,
          parameters: TRIP_VOICE_DRAFT_SCHEMA,
        },
        {
          type: "function",
          name: "confirm_trip",
          description:
            "Request saving only after reading the complete summary and receiving an explicit spoken yes.",
          strict: true,
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: { confirmed: { type: "boolean", const: true } },
            required: ["confirmed"],
          },
        },
      ],
      tool_choice: "auto",
    },
  } as const;
}

export async function createTripRealtimeClientSecret(principal: Principal) {
  const config = runtimeConfig();
  const response = await openAiRequest(
    "/realtime/client_secrets",
    tripRealtimeSessionBody(config),
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
    mode: "trip_creation" as const,
  };
}
