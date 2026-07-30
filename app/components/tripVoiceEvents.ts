import type { TripSaveGateEvent } from "./tripVoiceState";

type ToolCall = {
  name?: string;
  arguments?: string;
  call_id?: string;
  response_id?: string;
};

export type ParsedTripVoiceEvent =
  | { kind: "ignore" | "error" }
  | { kind: "tool_call"; call: ToolCall }
  | { kind: "gate"; gateEvent: TripSaveGateEvent }
  | {
      kind: "user_transcript";
      gateEvent: TripSaveGateEvent;
      transcript: string;
    }
  | {
      kind: "assistant_delta";
      gateEvent: TripSaveGateEvent;
      delta: string;
    }
  | { kind: "response_done"; gateEvent?: TripSaveGateEvent };

function textField(
  message: Record<string, unknown>,
  field: string,
): string | undefined {
  return typeof message[field] === "string"
    ? (message[field] as string)
    : undefined;
}

function responseSummary(value: unknown): {
  id?: string;
  outputItemIds: string[];
  transcript?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { outputItemIds: [] };
  }
  const response = value as Record<string, unknown>;
  const output = Array.isArray(response.output) ? response.output : [];
  const outputItemIds: string[] = [];
  const transcripts: string[] = [];
  for (const candidate of output) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const item = candidate as Record<string, unknown>;
    if (typeof item.id === "string") outputItemIds.push(item.id);
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const transcript = (part as Record<string, unknown>).transcript;
      if (typeof transcript === "string") transcripts.push(transcript);
    }
  }
  return {
    id: typeof response.id === "string" ? response.id : undefined,
    outputItemIds,
    transcript: transcripts.length ? transcripts.join(" ") : undefined,
  };
}

export function parseTripVoiceRealtimeEvent(
  data: string,
): ParsedTripVoiceEvent {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return { kind: "ignore" };
  }
  const type = textField(message, "type");
  if (type === "response.function_call_arguments.done") {
    return {
      kind: "tool_call",
      call: {
        name: textField(message, "name"),
        arguments: textField(message, "arguments"),
        call_id: textField(message, "call_id"),
        response_id: textField(message, "response_id"),
      },
    };
  }
  if (type === "response.created") {
    const response = responseSummary(message.response);
    return response.id
      ? {
          kind: "gate",
          gateEvent: { type: "response_created", responseId: response.id },
        }
      : { kind: "ignore" };
  }
  if (type === "conversation.item.created") {
    const item =
      message.item &&
      typeof message.item === "object" &&
      !Array.isArray(message.item)
        ? (message.item as Record<string, unknown>)
        : null;
    if (item?.role !== "user" || typeof item.id !== "string") {
      return { kind: "ignore" };
    }
    return {
      kind: "gate",
      gateEvent: {
        type: "user_item_created",
        itemId: item.id,
        previousItemId: textField(message, "previous_item_id"),
      },
    };
  }
  if (type === "input_audio_buffer.committed") {
    const itemId = textField(message, "item_id");
    return itemId
      ? {
          kind: "gate",
          gateEvent: {
            type: "user_item_created",
            itemId,
            previousItemId: textField(message, "previous_item_id"),
          },
        }
      : { kind: "ignore" };
  }
  const responseId = textField(message, "response_id");
  const transcript = textField(message, "transcript");
  const itemId = textField(message, "item_id");
  if (
    type === "conversation.item.input_audio_transcription.completed" &&
    transcript &&
    itemId
  ) {
    return {
      kind: "user_transcript",
      transcript,
      gateEvent: { type: "user_transcript", itemId, transcript },
    };
  }
  if (type === "response.output_audio_transcript.delta" && responseId) {
    const delta = textField(message, "delta");
    return delta
      ? {
          kind: "assistant_delta",
          delta,
          gateEvent: {
            type: "assistant_transcript",
            responseId,
            transcript: delta,
          },
        }
      : { kind: "ignore" };
  }
  if (
    type === "response.output_audio_transcript.done" &&
    responseId &&
    transcript
  ) {
    return {
      kind: "gate",
      gateEvent: {
        type: "assistant_transcript",
        responseId,
        transcript,
        replace: true,
      },
    };
  }
  if (type === "response.done") {
    const response = responseSummary(message.response);
    return {
      kind: "response_done",
      gateEvent: response.id
        ? {
            type: "response_done",
            responseId: response.id,
            transcript: response.transcript,
            outputItemIds: response.outputItemIds,
          }
        : undefined,
    };
  }
  return { kind: type === "error" ? "error" : "ignore" };
}
