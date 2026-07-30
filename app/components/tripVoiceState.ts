import type { TripVoiceDraft } from "@/src/domain/trip-voice";
import type { TripDraft } from "./types";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "review"
  | "saving"
  | "saved"
  | "error";

export function tripVoiceStatus(state: VoiceState): string {
  return {
    idle: "Microphone off",
    connecting: "Connecting securely",
    listening: "Listening",
    speaking: "Assistant speaking",
    review: "Ready for your confirmation",
    saving: "Saving confirmed trip",
    saved: "Trip saved",
    error: "Voice paused",
  }[state];
}

export function voiceDraftFromTrip(draft: TripDraft): TripVoiceDraft {
  return {
    title: draft.title.trim() || null,
    location: draft.location.trim() || null,
    country: draft.country || null,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    calculationMethod: draft.calculationMethod || null,
    eligibleDates: draft.eligibleDates.length ? draft.eligibleDates : null,
    eligibilityAttested: draft.attested || null,
  };
}

export function tripDraftFromVoice(draft: TripVoiceDraft): TripDraft {
  return {
    title: draft.title ?? "",
    location: draft.location ?? "",
    country: "GB",
    startDate: draft.startDate ?? "",
    endDate: draft.endDate ?? "",
    calculationMethod: draft.calculationMethod ?? "daily",
    eligibleDates: draft.eligibleDates ?? [],
    attested: draft.eligibilityAttested === true,
  };
}

type SaveGatePhase =
  | "inactive"
  | "waiting_for_prompt_response"
  | "waiting_for_user";

export type TripSaveGate = {
  order: number;
  phase: SaveGatePhase;
  sourceResponseId: string | null;
  promptResponseId: string | null;
  promptTranscript: string;
  promptOutputItemIds: string[];
  promptCompletedAt: number | null;
  pendingUserItem: { id: string; createdAt: number } | null;
  userTranscript: string;
  responseCreatedAt: Record<string, number>;
};

export type TripSaveGateEvent =
  | { type: "response_created"; responseId: string }
  | {
      type: "assistant_transcript";
      responseId: string;
      transcript: string;
      replace?: boolean;
    }
  | {
      type: "response_done";
      responseId: string;
      transcript?: string;
      outputItemIds?: string[];
    }
  | {
      type: "user_item_created";
      itemId: string;
      previousItemId?: string;
    }
  | { type: "user_transcript"; itemId: string; transcript: string };

export function emptyTripSaveGate(order = 0): TripSaveGate {
  return {
    order,
    phase: "inactive",
    sourceResponseId: null,
    promptResponseId: null,
    promptTranscript: "",
    promptOutputItemIds: [],
    promptCompletedAt: null,
    pendingUserItem: null,
    userTranscript: "",
    responseCreatedAt: {},
  };
}

export function beginTripSavePrompt(
  current: TripSaveGate,
  sourceResponseId?: string,
): TripSaveGate {
  return {
    ...emptyTripSaveGate(current.order + 1),
    phase: "waiting_for_prompt_response",
    sourceResponseId: sourceResponseId ?? null,
  };
}

function includesFinalSaveQuestion(transcript: string): boolean {
  const clean = transcript
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return clean.includes("shall i save this trip");
}

export function reduceTripSaveGate(
  current: TripSaveGate,
  event: TripSaveGateEvent,
): TripSaveGate {
  const order = current.order + 1;
  if (event.type === "response_created") {
    const promptResponseId =
      current.phase === "waiting_for_prompt_response" &&
      !current.promptResponseId &&
      event.responseId !== current.sourceResponseId
        ? event.responseId
        : current.promptResponseId;
    return {
      ...current,
      order,
      promptResponseId,
      responseCreatedAt: {
        ...current.responseCreatedAt,
        [event.responseId]: order,
      },
    };
  }
  if (
    event.type === "assistant_transcript" &&
    event.responseId === current.promptResponseId
  ) {
    return {
      ...current,
      order,
      promptTranscript: event.replace
        ? event.transcript
        : `${current.promptTranscript}${event.transcript}`,
    };
  }
  if (
    event.type === "response_done" &&
    current.phase === "waiting_for_prompt_response" &&
    event.responseId === current.promptResponseId
  ) {
    const transcript = event.transcript ?? current.promptTranscript;
    if (!includesFinalSaveQuestion(transcript)) {
      return emptyTripSaveGate(order);
    }
    return {
      ...current,
      order,
      phase: "waiting_for_user",
      promptTranscript: transcript,
      promptOutputItemIds: event.outputItemIds ?? [],
      promptCompletedAt: order,
      pendingUserItem: null,
      userTranscript: "",
    };
  }
  if (
    event.type === "user_item_created" &&
    current.phase === "waiting_for_user" &&
    current.promptCompletedAt !== null &&
    (!event.previousItemId ||
      current.promptOutputItemIds.length === 0 ||
      current.promptOutputItemIds.includes(event.previousItemId))
  ) {
    return {
      ...current,
      order,
      pendingUserItem:
        current.pendingUserItem?.id === event.itemId
          ? current.pendingUserItem
          : { id: event.itemId, createdAt: order },
      userTranscript: "",
    };
  }
  if (
    event.type === "user_transcript" &&
    current.phase === "waiting_for_user" &&
    event.itemId === current.pendingUserItem?.id
  ) {
    return { ...current, order, userTranscript: event.transcript };
  }
  return { ...current, order };
}

export function canSaveTripFromVoice(
  gate: TripSaveGate,
  responseId: string | undefined,
  isExplicitConfirmation: (value: unknown) => boolean,
): boolean {
  if (
    gate.phase !== "waiting_for_user" ||
    !responseId ||
    responseId === gate.promptResponseId ||
    !gate.pendingUserItem ||
    !gate.userTranscript
  ) {
    return false;
  }
  const responseCreatedAt = gate.responseCreatedAt[responseId];
  return (
    typeof responseCreatedAt === "number" &&
    responseCreatedAt > gate.pendingUserItem.createdAt &&
    isExplicitConfirmation(gate.userTranscript)
  );
}
