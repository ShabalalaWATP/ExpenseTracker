"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { receiptEvidenceUrls } from "@/src/domain/receipt-evidence";
import { uploadReceipt } from "./api";
import { normaliseReceipt } from "./receipt-intake/image";
import type { Expense } from "./types";

const MAX_RECEIPT_BYTES = 20 * 1_048_576;

export function ReceiptEvidence({ expense }: { expense: Expense }) {
  const [failedExpenseId, setFailedExpenseId] = useState("");
  const previewFailed = failedExpenseId === expense.id;
  if (expense.receiptStatus !== "stored") return null;
  const urls = receiptEvidenceUrls(expense);

  return (
    <section className="receipt-evidence" aria-labelledby={`receipt-evidence-${expense.id}`}>
      <div className="receipt-evidence-heading">
        <div>
          <p className="eyebrow">Original evidence</p>
          <h3 id={`receipt-evidence-${expense.id}`}>Receipt photo</h3>
        </div>
        <span className="state-label success">Stored</span>
      </div>
      <div className="receipt-evidence-preview">
        {previewFailed ? (
          <p>
            This photo cannot be previewed in this browser. The original is
            still available to download.
          </p>
        ) : (
          <Image
            src={urls.preview}
            width={800}
            height={1100}
            alt={`Receipt from ${expense.merchant}`}
            unoptimized
            onError={() => setFailedExpenseId(expense.id)}
          />
        )}
      </div>
      <div className="receipt-evidence-actions">
        <a
          className="secondary-button"
          href={urls.preview}
          target="_blank"
          rel="noreferrer"
        >
          Open full size
        </a>
        <a className="text-button" href={urls.download} download>
          Download original
        </a>
      </div>
    </section>
  );
}

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
      const needsCompatiblePreview =
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        /\.(?:heic|heif)$/i.test(file.name);
      const compatiblePreview = needsCompatiblePreview
        ? await normaliseReceipt(file)
        : undefined;
      await uploadReceipt(
        expense.id,
        file,
        uploadKey.current,
        compatiblePreview,
      );
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
