"use client";

import { useRef, useState } from "react";
import { uploadReceipt } from "./api";
import type { Expense } from "./types";

const MAX_RECEIPT_BYTES = 20 * 1_048_576;

export function ReceiptAttachment({
  expense,
  onChanged,
}: {
  expense: Expense;
  onChanged: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploadKey = useRef("");
  const [pending, setPending] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "uploading" | "failed">("idle");
  const [error, setError] = useState("");

  async function send(file: File) {
    if (file.size === 0 || file.size > MAX_RECEIPT_BYTES) {
      setError("Choose a receipt image no larger than 20 MB.");
      setState("failed");
      return;
    }
    setState("uploading");
    setError("");
    if (!uploadKey.current) uploadKey.current = crypto.randomUUID();
    try {
      await uploadReceipt(expense.id, file, uploadKey.current);
      setPending(null);
      uploadKey.current = "";
      setState("idle");
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The receipt could not be attached.",
      );
      setState("failed");
    }
  }

  function choose(file: File | null) {
    if (!file) return;
    setPending(file);
    uploadKey.current = crypto.randomUUID();
    void send(file);
  }

  return (
    <span className="receipt-attachment">
      <button
        className="round-button"
        type="button"
        disabled={state === "uploading"}
        aria-label={`${
          state === "failed" ? "Retry receipt for" : "Attach receipt to"
        } ${expense.merchant}`}
        title={error || "Attach receipt"}
        onClick={() =>
          pending ? void send(pending) : input.current?.click()
        }
      >
        {state === "uploading" ? "…" : state === "failed" ? "↻" : "＋"}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        aria-hidden="true"
        accept="image/jpeg,image/png,image/heic,image/heif"
        capture="environment"
        onChange={(event) => {
          choose(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      {error ? <span className="sr-only" role="alert">{error}</span> : null}
    </span>
  );
}
