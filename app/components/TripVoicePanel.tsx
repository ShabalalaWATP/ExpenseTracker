import type { TripVoiceDraft } from "@/src/domain/trip-voice";
import { TripVoiceDraftSummary } from "./TripVoiceDraftSummary";
import { tripVoiceStatus, type VoiceState } from "./tripVoiceState";

export function TripVoicePanel({
  state,
  error,
  heard,
  assistant,
  draft,
  onStop,
  onManual,
}: {
  state: VoiceState;
  error: string;
  heard: string;
  assistant: string;
  draft: TripVoiceDraft;
  onStop: () => void;
  onManual: () => void;
}) {
  const active = !["idle", "error", "saved"].includes(state);
  const hasDraft = Boolean(
    draft.title ||
    draft.startDate ||
    draft.legs?.some((leg) => leg.location),
  );
  return (
    <section className={`trip-voice ${active ? "active" : ""}`}>
      <div className="trip-voice-heading">
        <div>
          <p className="eyebrow">OpenAI Realtime voice</p>
          <h3>Trip assistant</h3>
          <p>
            Describe the trip naturally. The assistant gathers each detail,
            reads it back, then creates the trip when you say you are happy.
          </p>
        </div>
        {active ? (
          <button
            className="trip-mic active"
            type="button"
            aria-label="End voice chat"
            onClick={onStop}
          >
            <span aria-hidden="true">■</span>
            End chat
          </button>
        ) : null}
      </div>
      <div className="trip-voice-status" role="status" aria-live="polite">
        <span className="trip-voice-signal" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>
          {state === "idle"
            ? "Ready for a live conversation"
            : tripVoiceStatus(state)}
        </strong>
        {state === "idle" ? (
          <span>Choose Create a trip to start speaking immediately.</span>
        ) : null}
        {heard ? <span>Live caption, you: “{heard}”</span> : null}
        {assistant ? (
          <span>Live caption, assistant: “{assistant}”</span>
        ) : null}
      </div>
      {error ? <p className="trip-voice-error" role="alert">{error}</p> : null}
      {active || hasDraft ? <TripVoiceDraftSummary draft={draft} /> : null}
      <div className="trip-voice-footer">
        <p>
          Your microphone is active only during this session. Audio streams to
          OpenAI using a short-lived credential and is not stored by
          ExpenseTracker.
        </p>
        <button className="text-button" type="button" onClick={onManual}>
          Type instead
        </button>
      </div>
    </section>
  );
}
