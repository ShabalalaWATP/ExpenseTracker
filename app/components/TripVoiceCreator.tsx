"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  EMPTY_TRIP_VOICE_DRAFT,
  isExplicitTripSaveConfirmation,
  isTripVoiceDraftComplete,
  mergeTripVoiceDraft,
  tripVoiceDraftIssues,
} from "@/src/domain/trip-voice";
import type { TripDraft } from "./types";
import { createTripRealtimeSession } from "./tripVoiceApi";
import { TripVoicePanel } from "./TripVoicePanel";
import { parseTripVoiceRealtimeEvent } from "./tripVoiceEvents";
import {
  beginTripSavePrompt,
  canSaveTripFromVoice,
  emptyTripSaveGate,
  reduceTripSaveGate,
  tripDraftFromVoice,
  voiceDraftFromTrip,
  type TripSaveGateEvent,
  type VoiceState,
} from "./tripVoiceState";

export type TripVoiceCreatorHandle = {
  start: (initialDraft?: TripDraft) => Promise<void>;
  stop: () => void;
};

export const TripVoiceCreator = forwardRef<TripVoiceCreatorHandle, {
  draft: TripDraft;
  onDraftChange: (draft: TripDraft) => void;
  onConfirmedSave: (draft: TripDraft) => Promise<void>;
  onManual: () => void;
}>(function TripVoiceCreator({
  draft,
  onDraftChange,
  onConfirmedSave,
  onManual,
}, ref) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [assistant, setAssistant] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const draftRef = useRef(voiceDraftFromTrip(draft));
  const savingRef = useRef(false);
  const saveGateRef = useRef(emptyTripSaveGate());
  useEffect(() => {
    draftRef.current = voiceDraftFromTrip(draft);
  }, [draft]);
  function releaseMedia() {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
  }
  function stop() {
    releaseMedia();
    savingRef.current = false;
    saveGateRef.current = emptyTripSaveGate(saveGateRef.current.order);
    setState("idle");
  }
  useImperativeHandle(ref, () => ({ start, stop }));
  useEffect(() => releaseMedia, []);
  function recordSaveGateEvent(event: TripSaveGateEvent) {
    saveGateRef.current = reduceTripSaveGate(saveGateRef.current, event);
    return saveGateRef.current;
  }
  function sendToolOutput(
    callId: string | undefined,
    output: Record<string, unknown>,
    instructions: string,
  ) {
    const channel = channelRef.current;
    if (!channel || !callId) return;
    channel.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      }),
    );
    channel.send(
      JSON.stringify({
        type: "response.create",
        response: { instructions },
      }),
    );
  }
  async function handleToolCall(message: {
    name?: string;
    arguments?: string;
    call_id?: string;
    response_id?: string;
  }) {
    let values: unknown;
    try {
      values = JSON.parse(message.arguments ?? "{}");
    } catch {
      sendToolOutput(
        message.call_id,
        { accepted: false, issue: "Invalid structured data." },
        "Ask the user for that detail again.",
      );
      return;
    }
    if (message.name === "update_trip_draft") {
      const merged = mergeTripVoiceDraft(draftRef.current, values);
      draftRef.current = merged.draft;
      onDraftChange(tripDraftFromVoice(merged.draft));
      const issues = tripVoiceDraftIssues(merged.draft);
      const complete = issues.length === 0;
      saveGateRef.current = complete
        ? beginTripSavePrompt(saveGateRef.current, message.response_id)
        : emptyTripSaveGate(saveGateRef.current.order);
      setHeard("");
      setState(complete ? "review" : "listening");
      sendToolOutput(
        message.call_id,
        {
          accepted: merged.rejectedFields.length === 0,
          rejectedFields: merged.rejectedFields,
          complete,
          issues,
        },
        complete
          ? "Read the complete trip summary aloud, then ask exactly: Does that all sound right, and are you happy for me to create this trip now? After a clear approval, call confirm_trip immediately without asking again."
          : "Ask one short follow-up question for the first issue. Do not ask again for a valid fact already in the draft.",
      );
      return;
    }

    if (message.name !== "confirm_trip") return;
    const confirmed =
      values &&
      typeof values === "object" &&
      !Array.isArray(values) &&
      (values as Record<string, unknown>).confirmed === true;
    const spokenConfirmation = canSaveTripFromVoice(
      saveGateRef.current,
      message.response_id,
      isExplicitTripSaveConfirmation,
    );
    const issues = tripVoiceDraftIssues(draftRef.current);
    if (
      !confirmed ||
      !spokenConfirmation ||
      issues.length ||
      savingRef.current
    ) {
      saveGateRef.current = issues.length
        ? emptyTripSaveGate(saveGateRef.current.order)
        : beginTripSavePrompt(saveGateRef.current, message.response_id);
      setHeard("");
      sendToolOutput(
        message.call_id,
        { saved: false, issues },
        issues.length
          ? "The trip is incomplete. Ask for the first missing or invalid detail."
          : "Ask exactly: Does that all sound right, and are you happy for me to create this trip now? Wait for a new, clear answer.",
      );
      return;
    }
    try {
      savingRef.current = true;
      saveGateRef.current = emptyTripSaveGate(saveGateRef.current.order);
      setState("saving");
      await onConfirmedSave(tripDraftFromVoice(draftRef.current));
      sendToolOutput(
        message.call_id,
        { saved: true },
        "Briefly say that the trip was saved, then end the conversation.",
      );
      setState("saved");
      releaseMedia();
    } catch (caught) {
      savingRef.current = false;
      const messageText =
        caught instanceof Error ? caught.message : "The trip could not be saved.";
      setError(messageText);
      setState("error");
      sendToolOutput(
        message.call_id,
        { saved: false, issue: messageText },
        "Say the trip was not saved and suggest using the manual form.",
      );
    }
  }

  function handleEvent(event: MessageEvent<string>) {
    const parsed = parseTripVoiceRealtimeEvent(event.data);
    if (parsed.kind === "tool_call") {
      void handleToolCall(parsed.call);
    } else if (parsed.kind === "gate") {
      recordSaveGateEvent(parsed.gateEvent);
    } else if (parsed.kind === "user_transcript") {
      const gate = recordSaveGateEvent(parsed.gateEvent);
      if (gate.userTranscript === parsed.transcript) {
        setHeard(parsed.transcript.slice(0, 280));
      }
    } else if (parsed.kind === "assistant_delta") {
      recordSaveGateEvent(parsed.gateEvent);
      setState("speaking");
      setAssistant((current) => `${current}${parsed.delta}`.slice(-600));
    } else if (parsed.kind === "response_done" && !savingRef.current) {
      const gate = parsed.gateEvent
        ? recordSaveGateEvent(parsed.gateEvent)
        : saveGateRef.current;
      if (gate.phase === "waiting_for_user") setHeard("");
      setState(
        isTripVoiceDraftComplete(draftRef.current) &&
          gate.phase === "waiting_for_user"
          ? "review"
          : "listening",
      );
    } else if (parsed.kind === "error") {
      setError("The voice assistant reported a connection error.");
      setState("error");
    }
  }

  async function start(initialDraft?: TripDraft) {
    releaseMedia();
    savingRef.current = false;
    setState("connecting");
    setError("");
    setHeard("");
    setAssistant("");
    saveGateRef.current = emptyTripSaveGate(saveGateRef.current.order);
    const startingDraft = initialDraft ?? draft;
    draftRef.current =
      startingDraft.title ||
      startingDraft.legs.some((leg) => leg.location) ||
      startingDraft.startDate
        ? voiceDraftFromTrip(startingDraft)
        : EMPTY_TRIP_VOICE_DRAFT;
    if (initialDraft) onDraftChange(initialDraft);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error(
          "Voice is not available in this browser. Use the manual form instead.",
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const session = await createTripRealtimeSession();
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (trackEvent) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = trackEvent.streams[0];
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        void audioRef.current.play().catch(() => {
          setError(
            "The voice assistant connected, but Safari blocked its audio. Tap Create a trip again to allow sound.",
          );
        });
      };
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", handleEvent);
      channel.addEventListener("open", () => {
        setState("listening");
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                "Start speaking immediately with exactly: Please tell me about your trip, including where you went and when. Do not give a setup explanation and do not ask only for a title. Invite the user to describe the trip naturally, extract every supported detail from their answer, then actively ask one concise question at a time for anything still needed.",
            },
          }),
        );
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("The browser could not prepare audio.");
      const response = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        },
      );
      if (!response.ok) throw new Error("The voice connection was refused.");
      await peer.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    } catch (caught) {
      releaseMedia();
      setError(
        caught instanceof Error
          ? caught.message
          : "Voice trip creation is unavailable.",
      );
      setState("error");
    }
  }
  const voiceDraft = voiceDraftFromTrip(draft);

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="sr-only" />
      <TripVoicePanel
        state={state}
        error={error}
        heard={heard}
        assistant={assistant}
        draft={voiceDraft}
        onStop={stop}
        onManual={onManual}
      />
    </>
  );
});
