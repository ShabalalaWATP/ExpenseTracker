"use client";

import { useEffect, useRef, useState } from "react";
import type { PolicyAssistantAnswer } from "./api";
import { createPolicyRealtimeSession } from "./policyVoiceApi";

type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "checking"
  | "speaking"
  | "error";

function eventText(
  data: string,
): { type?: string; transcript?: string; delta?: string } {
  try {
    const message = JSON.parse(data) as Record<string, unknown>;
    return {
      type: typeof message.type === "string" ? message.type : undefined,
      transcript:
        typeof message.transcript === "string"
          ? message.transcript
          : undefined,
      delta: typeof message.delta === "string" ? message.delta : undefined,
    };
  } catch {
    return {};
  }
}

function statusText(state: VoiceState): string {
  return {
    idle: "Ready for a live conversation",
    connecting: "Connecting securely",
    listening: "Listening",
    checking: "Checking the stored JSP and GOV.UK",
    speaking: "Policy assistant speaking",
    error: "Voice paused",
  }[state];
}

export function PolicyVoiceAssistant({
  onQuestion,
}: {
  onQuestion: (question: string) => Promise<PolicyAssistantAnswer>;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [heard, setHeard] = useState("");
  const [assistant, setAssistant] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onQuestionRef = useRef(onQuestion);
  const askingRef = useRef(false);
  const sessionIdRef = useRef(0);
  useEffect(() => {
    onQuestionRef.current = onQuestion;
  }, [onQuestion]);

  function releaseMedia() {
    sessionIdRef.current += 1;
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    askingRef.current = false;
  }

  function stop() {
    releaseMedia();
    setState("idle");
    setError("");
  }

  function fail(message: string) {
    releaseMedia();
    setError(message);
    setState("error");
  }

  useEffect(() => releaseMedia, []);

  function requestSpokenResponse(instructions: string) {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(
      JSON.stringify({
        type: "response.create",
        response: { instructions },
      }),
    );
  }

  async function answerTranscript(transcript: string) {
    const question = transcript.trim();
    if (!question || askingRef.current) return;
    if (question.length > 2_000) {
      setError("That question was too long. Please ask it more briefly.");
      return;
    }

    askingRef.current = true;
    const sessionId = sessionIdRef.current;
    setState("checking");
    setHeard(question.slice(0, 280));
    setAssistant("");
    try {
      const answer = await onQuestionRef.current(question);
      if (sessionId !== sessionIdRef.current) return;
      requestSpokenResponse(
        [
          "Read the verified answer below faithfully in a natural voice.",
          "Do not add, omit or reinterpret any policy claim. Do not read URLs, model names or page numbers aloud.",
          "After the answer, say that the supporting sources are shown on screen and invite one follow-up question.",
          "<verified_policy_answer>",
          answer.answer,
          "</verified_policy_answer>",
        ].join("\n"),
      );
      setState("speaking");
    } catch {
      if (sessionId !== sessionIdRef.current) return;
      requestSpokenResponse(
        "Briefly apologise and suggest typing the question or opening the stored JSP. Do not provide a policy answer from your own knowledge.",
      );
      setState("listening");
    } finally {
      if (sessionId === sessionIdRef.current) askingRef.current = false;
    }
  }

  function handleMessage(event: MessageEvent<string>) {
    const message = eventText(event.data);
    if (
      message.type ===
        "conversation.item.input_audio_transcription.completed" &&
      message.transcript
    ) {
      setHeard(message.transcript.slice(0, 280));
      void answerTranscript(message.transcript);
    } else if (
      message.type === "response.output_audio_transcript.delta" &&
      message.delta
    ) {
      setState("speaking");
      setAssistant((current) => `${current}${message.delta}`.slice(-700));
    } else if (message.type === "response.done" && !askingRef.current) {
      setState("listening");
    } else if (message.type === "error") {
      fail("The voice assistant reported a connection error.");
    }
  }

  async function start() {
    releaseMedia();
    const sessionId = sessionIdRef.current;
    let stream: MediaStream | null = null;
    let peer: RTCPeerConnection | null = null;
    setState("connecting");
    setError("");
    setHeard("");
    setAssistant("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
        throw new Error(
          "Voice is not available in this browser. Use the text chat instead.",
        );
      }
      const acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      stream = acquiredStream;
      if (sessionId !== sessionIdRef.current) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = acquiredStream;
      const session = await createPolicyRealtimeSession();
      if (sessionId !== sessionIdRef.current) {
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }
      const connection = new RTCPeerConnection();
      peer = connection;
      peerRef.current = connection;
      acquiredStream
        .getTracks()
        .forEach((track) => connection.addTrack(track, acquiredStream));
      connection.ontrack = (trackEvent) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = trackEvent.streams[0];
        audioRef.current.muted = false;
        audioRef.current.volume = 1;
        void audioRef.current.play().catch(() => {
          setError(
            "Safari blocked the assistant audio. End the chat, then start it again.",
          );
        });
      };
      const channel = connection.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", handleMessage);
      channel.addEventListener("open", () => {
        setState("listening");
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions:
                "Begin immediately with exactly: Ask me any JSP 752 question, and I will check the stored policy and current official sources for you.",
            },
          }),
        );
      });
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      if (!offer.sdp) throw new Error("The browser could not prepare audio.");
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.value}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!response.ok) throw new Error("The voice connection was refused.");
      if (sessionId !== sessionIdRef.current) {
        connection.close();
        acquiredStream.getTracks().forEach((track) => track.stop());
        return;
      }
      await connection.setRemoteDescription({
        type: "answer",
        sdp: await response.text(),
      });
    } catch (caught) {
      if (sessionId !== sessionIdRef.current) {
        peer?.close();
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      fail(
        caught instanceof Error
          ? caught.message
          : "Voice policy chat is unavailable.",
      );
    }
  }

  const active = !["idle", "error"].includes(state);
  return (
    <section className={`policy-voice ${active ? "active" : ""}`}>
      <audio ref={audioRef} autoPlay playsInline />
      <div className="policy-voice-heading">
        <div>
          <p className="eyebrow">OpenAI Realtime voice</p>
          <h2>Talk to the policy assistant</h2>
          <p>
            Ask naturally. The app checks the stored JSP and current official
            sources, shows the sourced answer below and reads it aloud.
          </p>
        </div>
        <button
          className={`trip-mic ${active ? "active" : ""}`}
          type="button"
          onClick={active ? stop : () => void start()}
          disabled={state === "connecting"}
        >
          <span aria-hidden="true">{active ? "■" : "●"}</span>
          {active ? "End chat" : state === "connecting" ? "Connecting…" : "Start voice chat"}
        </button>
      </div>
      <div className="policy-voice-status" role="status" aria-live="polite">
        <strong>{statusText(state)}</strong>
        {heard ? <span>You: “{heard}”</span> : null}
        {assistant ? <span>Assistant: “{assistant}”</span> : null}
      </div>
      {error ? <p className="trip-voice-error" role="alert">{error}</p> : null}
      <p className="policy-voice-privacy">
        Your microphone is active only during this session. Audio streams to
        OpenAI using a short-lived credential and is not stored by
        ExpenseTracker.
      </p>
    </section>
  );
}
