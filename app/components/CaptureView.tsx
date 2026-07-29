"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ManualCapture } from "./receipt-intake/ManualCapture";
import { ReceiptInbox } from "./receipt-intake/ReceiptInbox";
import { formatDate } from "./format";
import type { DashboardData } from "./types";
import { ViewHeader } from "./ui";

type CaptureMode = "inbox" | "manual";

export function CaptureView({
  data,
  initialDate,
  initialIntakeId,
  onSaved,
}: {
  data: DashboardData;
  initialDate?: string;
  initialIntakeId?: string;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<CaptureMode>("inbox");
  const inboxTab = useRef<HTMLButtonElement>(null);
  const manualTab = useRef<HTMLButtonElement>(null);

  function changeTab(event: KeyboardEvent, next: CaptureMode) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? "inbox"
        : event.key === "End"
          ? "manual"
          : next === "inbox"
            ? "manual"
            : "inbox";
    setMode(target);
    (target === "inbox" ? inboxTab : manualTab).current?.focus();
  }

  return (
    <div className="view page-enter capture-view intake-page">
      <ViewHeader
        eyebrow={initialDate ? `Receipt for ${formatDate(initialDate)}` : "New expense"}
        title="Capture receipts"
        detail={
          initialDate
            ? "The selected calendar date will be applied to the next receipt."
            : "Secure one receipt or a whole batch, then confirm only the details that need your attention."
        }
      />
      <div className="capture-mode-switch" role="tablist" aria-label="Receipt entry method">
        <button
          id="receipt-inbox-tab"
          ref={inboxTab}
          type="button"
          role="tab"
          aria-selected={mode === "inbox"}
          aria-controls="receipt-capture-panel"
          tabIndex={mode === "inbox" ? 0 : -1}
          onKeyDown={(event) => changeTab(event, mode)}
          onClick={() => setMode("inbox")}
        >
          Receipt inbox
          <small>Camera, bulk upload and assisted review</small>
        </button>
        <button
          id="manual-entry-tab"
          ref={manualTab}
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          aria-controls="receipt-capture-panel"
          tabIndex={mode === "manual" ? 0 : -1}
          onKeyDown={(event) => changeTab(event, mode)}
          onClick={() => setMode("manual")}
        >
          Manual entry
          <small>Enter one expense yourself</small>
        </button>
      </div>
      <div
        id="receipt-capture-panel"
        role="tabpanel"
        aria-labelledby={
          mode === "inbox" ? "receipt-inbox-tab" : "manual-entry-tab"
        }
      >
        {mode === "inbox" ? (
          <ReceiptInbox
            data={data}
            initialDate={initialDate}
            initialIntakeId={initialIntakeId}
            onSaved={onSaved}
          />
        ) : (
          <ManualCapture data={data} initialDate={initialDate} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}
