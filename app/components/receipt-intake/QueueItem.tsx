"use client";

import Image from "next/image";
import type { LocalUpload, ReceiptIntake } from "./types";

const STATUS_LABELS: Record<ReceiptIntake["status"], string> = {
  uploaded: "Manual review",
  analysing: "Reading receipt",
  needs_review: "Needs review",
  ready: "Ready to confirm",
  confirmed: "Confirmed",
  failed: "Needs attention",
};

function formatSize(bytes: number) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function LocalQueueItem({
  item,
  onRetry,
  onDismiss,
}: {
  item: LocalUpload;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const label = {
    queued: "Waiting",
    "waiting-online": "Waiting to retry",
    uploading: "Securing original",
    normalising: "Preparing image",
    failed: "Upload failed",
  }[item.stage];

  return (
    <li className={`intake-row local ${item.stage}`}>
      <span className="intake-thumb placeholder" aria-hidden="true">
        {item.stage === "failed" ? "!" : "↥"}
      </span>
      <span className="intake-summary">
        <strong>{item.file.name}</strong>
        <small>{item.error || `${formatSize(item.file.size)} · ${label}`}</small>
      </span>
      {item.stage === "failed" ? (
        <span className="local-row-actions">
          <button type="button" onClick={onRetry}>Retry</button>
          <button type="button" onClick={onDismiss} aria-label={`Dismiss ${item.file.name}`}>×</button>
        </span>
      ) : (
        <span className={`intake-state ${item.stage}`}>{label}</span>
      )}
    </li>
  );
}

export function QueueItem({
  intake,
  selected,
  processing,
  onSelect,
  onDelete,
  children,
}: {
  intake: ReceiptIntake;
  selected: boolean;
  processing: boolean;
  onSelect: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const status = processing ? "Reading receipt" : STATUS_LABELS[intake.status];
  const issueCount =
    intake.missingFields.length + intake.uncertainFields.length;
  const preview =
    intake.previewUrl ||
    `/api/receipt-intakes/${encodeURIComponent(intake.id)}/image`;

  return (
    <li className={`intake-row-shell ${selected ? "selected" : ""}`}>
      <div className="intake-row">
        <button
          className="intake-open"
          type="button"
          aria-expanded={selected}
          onClick={onSelect}
        >
          <span className="intake-thumb">
            <Image
              src={preview}
              alt=""
              fill
              sizes="64px"
              unoptimized
            />
          </span>
          <span className="intake-summary">
            <strong>{intake.merchant || intake.originalName}</strong>
            <small>
              {intake.serviceDate || "Date not found"}
              {issueCount ? ` · ${issueCount} to check` : ""}
            </small>
          </span>
          <span
            className={`intake-state ${processing ? "analysing" : intake.status}`}
          >
            {status}
          </span>
        </button>
        {intake.status !== "confirmed" ? (
          <button
            className="intake-delete"
            type="button"
            aria-label={`Remove ${intake.originalName}`}
            onClick={onDelete}
          >
            ×
          </button>
        ) : null}
      </div>
      {selected ? children : null}
    </li>
  );
}
