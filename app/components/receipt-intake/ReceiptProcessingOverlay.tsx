"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ReceiptProcessingSummary } from "./processing-state";

const STAGE_COPY = {
  queued: {
    title: "Preparing your secure upload",
    detail: "The selected photos are being added to the recovery queue.",
  },
  uploading: {
    title: "Securing the original receipt",
    detail: "Keep ExpenseTracker open until the server confirms the upload.",
  },
  preparing: {
    title: "Preparing a private analysis copy",
    detail: "The secured original is unchanged.",
  },
  analysing: {
    title: "Reading receipt details",
    detail: "AI is checking the printed facts and arithmetic.",
  },
  validating: {
    title: "Validating the receipt totals",
    detail: "ExpenseTracker is checking confidence, currency and reconciliation.",
  },
  confirming: {
    title: "Adding a clean receipt to the ledger",
    detail: "Strict server checks are running before the expense is confirmed.",
  },
  pending: {
    title: "Confirmation is still running",
    detail: "The secured receipt remains safe. Retry to check its status.",
  },
  waiting: {
    title: "Waiting for a connection",
    detail: "The original is still on this device and is not yet secured.",
  },
  failed: {
    title: "Some receipts need another try",
    detail: "Completed originals remain secured. Retry the interrupted items.",
  },
} as const;

function restoreAttribute(element: HTMLElement, value: string | null) {
  if (value === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", value);
}

export function ReceiptProcessingOverlay({
  processing,
  onRetry,
  onReturn,
  onCancel,
  canCancel,
}: {
  processing: ReceiptProcessingSummary;
  onRetry: () => void;
  onReturn: () => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted || !processing.visible) return;
    const overlay = dialogRef.current?.parentElement;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const priorOverflow = document.documentElement.style.overflow;
    const hidden = [...document.body.children]
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== overlay,
      )
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    hidden.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      hidden.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        restoreAttribute(element, ariaHidden);
      });
      document.documentElement.style.overflow = priorOverflow;
      previousFocus?.focus();
    };
  }, [mounted, processing.visible]);

  if (!mounted || !processing.visible) return null;
  const copy = STAGE_COPY[processing.stage];
  const blocked = processing.blocked > 0 && processing.running === 0;
  const activeLabel =
    processing.running > 1
      ? `${processing.running} receipts active`
      : processing.currentName;

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    if (!controls?.length) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="receipt-processing-backdrop">
      <div
        ref={dialogRef}
        className="receipt-processing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-processing-title"
        aria-describedby="receipt-processing-detail"
        aria-busy={!blocked}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <p className="eyebrow">
          {processing.total === 1
            ? "Receipt processing"
            : `Batch of ${processing.total}`}
        </p>
        <h2
          id="receipt-processing-title"
          aria-live="polite"
          aria-atomic="true"
        >
          {copy.title}
        </h2>
        <p id="receipt-processing-detail">{copy.detail}</p>
        <div
          className={`receipt-processing-track ${blocked ? "paused" : ""}`}
          aria-hidden="true"
        >
          <span />
        </div>
        <div className="receipt-processing-status" aria-live="polite">
          <strong>{activeLabel}</strong>
          <span>
            {processing.completed} of {processing.total} finished
            {" · "}
            {processing.secured} original
            {processing.secured === 1 ? "" : "s"} secured
          </span>
        </div>
        {blocked ? (
          <div className="receipt-processing-actions">
            <button className="primary-button" type="button" onClick={onRetry}>
              Retry {processing.blocked === 1 ? "receipt" : "receipts"}
            </button>
            <button className="text-button" type="button" onClick={onReturn}>
              Return to inbox
            </button>
          </div>
        ) : canCancel ? (
          <div className="receipt-processing-actions">
            <p className="receipt-processing-note">
              You can stop waiting for this batch. Originals already secured
              will remain in the inbox.
            </p>
            <button className="text-button" type="button" onClick={onCancel}>
              Stop waiting
            </button>
          </div>
        ) : (
          <p className="receipt-processing-note">
            The secured receipt is being checked. You can return to the inbox
            if this step reports an exception.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
