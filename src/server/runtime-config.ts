import { getRuntimeEnv } from "@/db";

export const DEFAULT_MODELS = Object.freeze({
  chat: "gpt-5.6-sol",
  receipt: "gpt-5.6-sol",
  realtime: "gpt-realtime-2.1",
  transcription: "gpt-realtime-whisper",
});

export const DEFAULT_REALTIME_VOICE = "marin";

function value(input: string | undefined, fallback = ""): string {
  const clean = input?.trim();
  return clean || fallback;
}

export function runtimeConfig() {
  const env = getRuntimeEnv();
  return {
    ownerEmail: value(env.EXPENSETRACKER_OWNER_EMAIL).toLowerCase(),
    openAiApiKey: value(env.OPENAI_API_KEY),
    models: {
      chat: value(env.OPENAI_CHAT_MODEL, DEFAULT_MODELS.chat),
      receipt: value(env.OPENAI_RECEIPT_MODEL, DEFAULT_MODELS.receipt),
      realtime: value(env.OPENAI_REALTIME_MODEL, DEFAULT_MODELS.realtime),
      transcription: value(
        env.OPENAI_TRANSCRIPTION_MODEL,
        DEFAULT_MODELS.transcription,
      ),
    },
    realtimeVoice: value(
      env.OPENAI_REALTIME_VOICE,
      DEFAULT_REALTIME_VOICE,
    ),
  };
}

export function publicAiStatus() {
  const config = runtimeConfig();
  return {
    configured: Boolean(config.openAiApiKey),
    models: config.models,
    voice: config.realtimeVoice,
    privacy:
      "Receipt images are sent to the OpenAI API only when analysis is requested. Suggestions must be reviewed before an expense is created.",
  };
}
