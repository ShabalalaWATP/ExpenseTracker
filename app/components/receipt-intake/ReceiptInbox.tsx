"use client";

import { useEffect, useState } from "react";
import { isStaleReceiptAnalysis } from "@/src/shared/receipt-processing-policy";
import type { DashboardData } from "../types";
import { StatusMessage } from "../ui";
import { IntakeDefaults } from "./IntakeDefaults";
import { IntakeReview } from "./IntakeReview";
import { LocalQueueItem, QueueItem } from "./QueueItem";
import { ReceiptProcessingOverlay } from "./ReceiptProcessingOverlay";
import { UploadActions } from "./UploadActions";
import { useReceiptInbox } from "./useReceiptInbox";

export function ReceiptInbox({
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
  const inbox = useReceiptInbox({
    initialDate,
    initialIntakeId,
    onSaved,
  });
  const [clock, setClock] = useState(() => Date.now());
  const hasAnalysingReceipt = inbox.intakes.some(
    (intake) => intake.status === "analysing",
  );
  useEffect(() => {
    if (!hasAnalysingReceipt) return;
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [hasAnalysingReceipt]);
  const activeCount = inbox.processing.running;
  const reviewCount = inbox.intakes.filter((item) =>
    ["uploaded", "needs_review", "ready"].includes(item.status),
  ).length;
  const voiceAvailable = Boolean(
    inbox.ai?.configured && inbox.ai.models.realtime,
  );

  return (
    <div className="receipt-inbox">
      <ReceiptProcessingOverlay
        processing={inbox.processing}
        onRetry={inbox.retryBlockedProcessing}
        onReturn={inbox.dismissProcessing}
        onCancel={inbox.cancelAllProcessing}
        canCancel={
          inbox.localUploads.length > 0 &&
          ["queued", "uploading", "preparing", "analysing"].includes(
            inbox.processing.stage,
          )
        }
      />
      <section className="intake-compose" aria-labelledby="intake-title">
        <div className="intake-intro">
          <div>
            <p className="eyebrow">Receipt inbox</p>
            <h2 id="intake-title">Add the photos. Review the facts.</h2>
          </div>
          <p>
            Originals are secured first. Unfinished uploads stay on this device
            and resume when ExpenseTracker is open and online. They are not
            secured until the server confirms the upload.
          </p>
        </div>
        <UploadActions
          busy={inbox.localUploads.length >= 20}
          onFiles={(files) => void inbox.addFiles(files)}
        />
        {inbox.ai && !inbox.ai.configured ? (
          <StatusMessage tone="warning">
            <strong>Automatic reading is off, so receipts wait for manual entry</strong>
            <p>
              Add the OPENAI_API_KEY secret to the deployment environment and
              reload to have details extracted for you. Photos still upload
              safely. Settings → AI and voice shows the current state.
            </p>
          </StatusMessage>
        ) : inbox.ai?.configured ? (
          <p className="ai-model-note">
            Receipt reading on · {inbox.ai.models.receipt}
            {inbox.ai.privacy ? ` · ${inbox.ai.privacy}` : ""}
          </p>
        ) : null}
        <IntakeDefaults
          data={data}
          value={inbox.defaults}
          onChange={inbox.setDefaults}
        />
      </section>

      <section className="intake-workspace" aria-labelledby="queue-title">
        <header className="queue-header">
          <div>
            <p className="eyebrow">Processing queue</p>
            <h2 id="queue-title">Receipts</h2>
          </div>
          <dl>
            <div><dt>In progress</dt><dd>{activeCount}</dd></div>
            <div><dt>To review</dt><dd>{reviewCount}</dd></div>
          </dl>
          {reviewCount || inbox.localUploads.length ? (
            <button
              className="text-button"
              type="button"
              onClick={() => void inbox.clearQueue()}
            >
              Clear queue
            </button>
          ) : null}
        </header>
        {inbox.error ? (
          <p className="intake-error" role="alert">{inbox.error}</p>
        ) : null}
        {inbox.loading ? (
          <div className="queue-loading" role="status">
            <span />
            Loading your receipt inbox…
          </div>
        ) : !inbox.localUploads.length && !inbox.intakes.length ? (
          <div className="intake-empty">
            <span aria-hidden="true">⌁</span>
            <strong>No receipts waiting</strong>
            <p>Take a photo or choose several from your Photo Library.</p>
          </div>
        ) : (
          <ol className="intake-queue">
            {inbox.localUploads.map((item) => (
              <LocalQueueItem
                key={item.id}
                item={item}
                onRetry={() => void inbox.processFile(item)}
                onDismiss={() => void inbox.dismissLocal(item.id)}
                onCancel={() => void inbox.cancelProcessing(item.id)}
              />
            ))}
            {inbox.intakes.map((intake) => {
              const processing = inbox.processingIds.includes(intake.id);
              return (
                <QueueItem
                  key={intake.id}
                  intake={intake}
                  processing={processing}
                  selected={inbox.selectedId === intake.id}
                  onSelect={() =>
                    inbox.setSelectedId(
                      inbox.selectedId === intake.id ? "" : intake.id,
                    )
                  }
                  onDelete={() => void inbox.remove(intake)}
                >
                  <IntakeReview
                    key={`${intake.id}-${intake.updatedAt}`}
                    intake={intake}
                    data={data}
                    voiceAvailable={voiceAvailable}
                    canRetryAnalysis={inbox.retryableAnalysisIds.includes(
                      intake.id,
                    )}
                    canReanalyse={Boolean(
                      inbox.ai?.configured &&
                      (intake.hasAnalysisCopy ||
                        (intake.status === "analysing" &&
                          isStaleReceiptAnalysis(
                            intake.updatedAt,
                            clock,
                          ))) &&
                      intake.status !== "confirmed" &&
                      !processing,
                    )}
                    analysisBusy={processing}
                    analysisModel={inbox.ai?.models.receipt ?? ""}
                    onUpdate={inbox.updateIntake}
                    onRetryAnalysis={() => inbox.retryAnalysis(intake)}
                    onReanalyse={(fields) =>
                      inbox.reanalyse(intake, fields)
                    }
                    onAnalyseWithEdits={(edits) =>
                      inbox.analyseWithEdits(intake, edits)
                    }
                    onConfirmed={() => inbox.confirmed(intake.id)}
                  />
                </QueueItem>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
