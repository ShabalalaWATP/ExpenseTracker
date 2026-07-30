import { TRIP_VOICE_DRAFT_SCHEMA } from "@/src/domain/trip-voice";
import { ApiError } from "./http";
import { openAiRequest } from "./openai-client";
import type { Principal } from "./principal";
import { runtimeConfig } from "./runtime-config";

function currentLondonDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function tripRealtimeSessionBody(config = runtimeConfig()) {
  return {
    session: {
      type: "realtime",
      model: config.models.realtime,
      instructions: [
        "You are the ExpenseTracker trip creation assistant.",
        "Understand the user's speech in any language. Reply briefly in the language they are using. When speaking English, use UK English.",
        `Today is ${currentLondonDate()} in the UK. Resolve natural and relative dates against this date.`,
        "Open by inviting the user to give the trip name, location, dates and short reason all in one go. Do not give a setup explanation or ask a sequence of set questions.",
        "Treat each answer as natural conversation. Extract every supported fact from the whole utterance at once, even when the user supplies every detail in one sentence. Aim to finish after the initial description and at most one concise follow-up.",
        "The update_trip_draft tool output is the authoritative memory. Never ask again for a valid fact already present in its draft, and never replace a known fact with null.",
        "Collect only: a short trip title, overall start and end dates, every itinerary stop with its nation and inclusive dates, and a short factual justification of one or two sentences.",
        "Use the name the user gives the trip. If they describe the destination and reason without naming it, create a short factual title from those details instead of asking for one.",
        "Represent each nation as its canonical upper-case two-letter country code. Infer the nation for an unambiguous place name; ask only when the place is genuinely ambiguous.",
        "For a trip with one location, use the overall trip start and end dates as that leg's dates. Do not ask for the same dates again. For multiple locations, infer each leg's dates only when the user makes them clear.",
        "Collect all stops in chronological order. Adjacent stops may share one same-day transition, but otherwise the next stop starts the following day.",
        "Accept facts in any order. After considering everything already known, if anything remains missing, ambiguous, contradictory, or invalid, ask one concise question about only the first genuinely unresolved fact. Never re-ask known overall or leg dates.",
        "After each useful answer, call update_trip_draft with the complete current draft before replying. Use null only for facts not yet known, never invent unsupported values, and never clear known values.",
        "When every field is valid, give one short readback with the title, every stop and nation, all dates, and the justification. In English, then ask: Does that all sound right, and are you happy for me to create this trip now? In another language, ask the natural equivalent of: Shall I save this trip?",
        "After that final readback, treat a clear approval such as yes, I am happy with that, that sounds good, or go ahead as permission to create the trip. Call confirm_trip immediately and do not ask for another confirmation.",
        "Silence, uncertainty, corrections, rejection, and earlier factual answers are not save approval. If the user corrects anything, update the draft, read the revised summary, and ask the final approval question again.",
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
            "Replace the structured trip draft after every useful user turn, extracting all facts supplied together. This never saves the trip.",
          parameters: TRIP_VOICE_DRAFT_SCHEMA,
        },
        {
          type: "function",
          name: "confirm_trip",
          description:
            "Create the trip only after the complete readback and a clear spoken approval, including natural agreement such as being happy with the summary.",
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
