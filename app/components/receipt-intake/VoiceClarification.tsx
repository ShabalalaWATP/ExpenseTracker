"use client";

import { useEffect, useRef, useState } from "react";
import {
  createRealtimeSession,
  submitClarification,
} from "./receiptApi";
import type { ReceiptIntake } from "./types";

const ALLOWED_FIELDS = new Set([
  "merchant",
  "serviceDate",
  "receiptTotalPence",
  "eligiblePence",
  "gratuityPence",
  "location",
  "businessReason",
  "mealContext",
  "category",
  "tripId",
  "alcoholReviewed",
]);

function safeArguments(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, field]) =>
        ALLOWED_FIELDS.has(key) &&
        field !== null &&
        field !== undefined &&
        field !== "",
    ),
  );
}

export function VoiceClarification({
  intake,
  onUpdate,
}: {
  intake: ReceiptIntake;
  onUpdate: (next: ReceiptIntake) => void;
}) {
  const [state, setState] = useState<
    "idle" | "connecting" | "listening" | "sending" | "error"
  >("idle");
  const [error, setError] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  function stop() {
    channelRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.srcObject = null;
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    setState("idle");
  }

  useEffect(
    () => () => {
      channelRef.current?.close();
      peerRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioRef.current) audioRef.current.srcObject = null;
    },
    [],
  );

  async function handleEvent(event: MessageEvent<string>) {
    let message: {
      type?: string;
      name?: string;
      arguments?: string;
      call_id?: string;
    };
    try {
      message = JSON.parse(event.data) as typeof message;
    } catch {
      return;
    }
    if (
      message.type !== "response.function_call_arguments.done" ||
      message.name !== "submit_clarification" ||
      !message.arguments
    ) {
      return;
    }

    try {
      setState("sending");
      const fields = safeArguments(message.arguments);
      if (!Object.keys(fields).length) {
        throw new Error("No permitted receipt details were returned.");
      }
      const updated = await submitClarification(intake.id, fields);
      onUpdate(updated);
      channelRef.current?.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: message.call_id,
            output: JSON.stringify({ saved: true }),
          },
        }),
      );
      channelRef.current?.send(
        JSON.stringify({
          type: "response.create",
          response: {
            instructions:
              "Briefly confirm the answer was saved. Do not ask another question.",
          },
        }),
      );
      setState("listening");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The spoken answer could not be saved.",
      );
      setState("error");
    }
  }

  async function start() {
    setState("connecting");
    setError("");
    try {
      const session = await createRealtimeSession(intake.id);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          void audioRef.current.play();
        }
      };

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", (event) => void handleEvent(event));
      channel.addEventListener("open", () => {
        setState("listening");
        channel.send(
          JSON.stringify({
            type: "response.create",
            response: {
              instructions: `Ask only this question: ${session.questions[0]}`,
            },
          }),
        );
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
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
      stop();
      setError(
        caught instanceof Error
          ? caught.message
          : "Voice clarification is unavailable.",
      );
      setState("error");
    }
  }

  if (!intake.clarificationQuestions.length) return null;

  const active =
    state === "connecting" || state === "listening" || state === "sending";
  return (
    <section className={`voice-clarification ${active ? "active" : ""}`}>
      <audio ref={audioRef} autoPlay className="sr-only" />
      <span className="voice-pulse" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <div>
        <strong>One detail needs you</strong>
        <p>{intake.clarificationQuestions[0]}</p>
        {error ? <small role="alert">{error}</small> : null}
      </div>
      <div className="voice-actions">
        {active ? (
          <button type="button" className="voice-stop" onClick={stop}>
            Stop microphone
          </button>
        ) : (
          <button type="button" className="voice-start" onClick={() => void start()}>
            Answer by voice
          </button>
        )}
        <button
          type="button"
          className="voice-type"
          onClick={(event) => {
            const field =
              intake.missingFields[0] ?? intake.uncertainFields[0] ?? "merchant";
            const target =
              {
                service_date: "serviceDate",
                receipt_total: "receiptTotalPence",
                eligible_amount: "eligiblePence",
                business_reason: "businessReason",
              }[field] ?? field;
            event.currentTarget
              .closest(".intake-review-form")
              ?.querySelector<HTMLElement>(
                `[data-intake-review-field="${target}"]`,
              )
              ?.focus();
          }}
        >
          Type instead
        </button>
      </div>
      <span className="sr-only" role="status">
        {state === "connecting"
          ? "Connecting microphone"
          : state === "listening"
            ? "Microphone active"
            : state === "sending"
              ? "Saving your answer"
              : ""}
      </span>
    </section>
  );
}
