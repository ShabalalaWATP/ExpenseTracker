import { apiRequest } from "./api";

export type PolicyRealtimeSession = {
  value: string;
  model: string;
  voice: string;
  mode: "policy_assistant";
};

function isPolicyRealtimeSession(
  value: unknown,
): value is PolicyRealtimeSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.value === "string" &&
    session.value.startsWith("ek_") &&
    typeof session.model === "string" &&
    typeof session.voice === "string" &&
    session.mode === "policy_assistant"
  );
}

export async function createPolicyRealtimeSession(): Promise<PolicyRealtimeSession> {
  const response = await apiRequest<{ data?: unknown } | unknown>(
    "/api/ai/realtime-session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "policy_assistant" }),
    },
  );
  const session =
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    "data" in response
      ? (response as { data?: unknown }).data
      : response;
  if (!isPolicyRealtimeSession(session)) {
    throw new Error("The voice session response was invalid.");
  }
  return session;
}
