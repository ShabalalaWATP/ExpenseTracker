"use client";

import type { DashboardData } from "../types";
import { IntakeDefaults } from "./IntakeDefaults";
import { IntakeReview } from "./IntakeReview";
import { LocalQueueItem, QueueItem } from "./QueueItem";
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
  const activeCount =
    inbox.localUploads.filter((item) => item.stage !== "failed").length +
    inbox.processingIds.length;
  const reviewCount = inbox.intakes.filter((item) =>
    ["uploaded", "needs_review", "ready"].includes(item.status),
  ).length;
  const voiceAvailable = Boolean(
    inbox.ai?.configured && inbox.ai.models.realtime,
  );

  return (
    <div className="receipt-inbox">
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
        <IntakeDefaults
          data={data}
          value={inbox.defaults}
          onChange={inbox.setDefaults}
        />
        <UploadActions
          busy={inbox.localUploads.length >= 20}
          onFiles={(files) => void inbox.addFiles(files)}
        />
        {inbox.ai && !inbox.ai.configured ? (
          <div className="ai-state">
            <span aria-hidden="true">i</span>
            <p>
              <strong>AI reading is not configured</strong>
              Photos still upload safely and can be reviewed manually.
            </p>
          </div>
        ) : inbox.ai?.configured ? (
          <p className="ai-model-note">
            Receipt reading on · {inbox.ai.models.receipt}
            {inbox.ai.privacy ? ` · ${inbox.ai.privacy}` : ""}
          </p>
        ) : null}
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
                      intake.hasAnalysisCopy &&
                      !["analysing", "confirmed"].includes(intake.status) &&
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
