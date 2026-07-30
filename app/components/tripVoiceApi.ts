import { apiRequest } from "./api";

export type TripRealtimeSession = {
  value: string;
  model: string;
  voice: string;
  mode: "trip_creation";
};

function isTripRealtimeSession(value: unknown): value is TripRealtimeSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.value === "string" &&
    session.value.startsWith("ek_") &&
    typeof session.model === "string" &&
    typeof session.voice === "string" &&
    session.mode === "trip_creation"
  );
}

export async function createTripRealtimeSession(): Promise<TripRealtimeSession> {
  const response = await apiRequest<{ data?: unknown } | unknown>(
    "/api/ai/realtime-session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "trip_creation" }),
    },
  );
  const session =
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    "data" in response
      ? (response as { data?: unknown }).data
      : response;
  if (!isTripRealtimeSession(session)) {
    throw new Error("The voice session response was invalid.");
  }
  return session;
}
