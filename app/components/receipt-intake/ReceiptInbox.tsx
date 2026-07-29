"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardData } from "../types";
import { IntakeDefaults } from "./IntakeDefaults";
import { IntakeReview } from "./IntakeReview";
import { canSelectReceipt, normaliseReceipt } from "./image";
import {
  analyseIntake,
  deleteIntake,
  getAiStatus,
  listIntakes,
  reanalyseIntake,
  uploadIntake,
} from "./receiptApi";
import { LocalQueueItem, QueueItem } from "./QueueItem";
import type {
  AiStatus,
  BatchDefaults,
  LocalUpload,
  ReceiptIntake,
} from "./types";
import { UploadActions } from "./UploadActions";

const MAX_BATCH = 20;

function identifier() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ReceiptInbox({
  data,
  initialDate,
  onSaved,
}: {
  data: DashboardData;
  initialDate?: string;
  onSaved: () => Promise<void>;
}) {
  const [intakes, setIntakes] = useState<ReceiptIntake[]>([]);
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [retryableAnalysisIds, setRetryableAnalysisIds] = useState<string[]>([]);
  const analysisFiles = useRef(new Map<string, File>());
  const [selectedId, setSelectedId] = useState("");
  const [defaults, setDefaults] = useState<BatchDefaults>({
    serviceDate: initialDate ?? "",
    location: "",
    businessReason: "",
    tripId: "",
    mealContext: "",
  });
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void Promise.allSettled([listIntakes(), getAiStatus()]).then(
      ([intakeResult, aiResult]) => {
        if (!current) return;
        if (intakeResult.status === "fulfilled") {
          setIntakes(intakeResult.value);
        } else {
          setError("The receipt inbox could not be loaded.");
        }
        if (aiResult.status === "fulfilled") setAi(aiResult.value);
        else {
          setAi({
            configured: false,
            models: { chat: "", receipt: "", realtime: "", transcription: "" },
            voice: "",
            privacy: "",
          });
        }
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, []);

  function updateLocal(id: string, changes: Partial<LocalUpload>) {
    setLocalUploads((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  function updateIntake(next: ReceiptIntake) {
    setIntakes((items) => {
      const exists = items.some((item) => item.id === next.id);
      return exists
        ? items.map((item) => (item.id === next.id ? next : item))
        : [next, ...items];
    });
  }

  async function processFile(
    local: LocalUpload,
    batchId: string,
    shared: BatchDefaults,
  ) {
    updateLocal(local.id, { stage: "uploading", error: undefined });
    let intake: ReceiptIntake;
    try {
      intake = await uploadIntake(
        local.file,
        batchId,
        shared,
        local.idempotencyKey,
      );
      updateIntake(intake);
      setSelectedId((selected) => selected || intake.id);
      setLocalUploads((items) => items.filter((item) => item.id !== local.id));
    } catch (caught) {
      updateLocal(local.id, {
        stage: "failed",
        error: caught instanceof Error ? caught.message : "Upload failed.",
      });
      return;
    }

    if (ai?.configured === false) return;
    analysisFiles.current.set(intake.id, local.file);
    setProcessingIds((ids) => [...ids, intake.id]);
    try {
      const analysisImage = await normaliseReceipt(local.file);
      const analysed = await analyseIntake(intake.id, analysisImage);
      updateIntake(analysed);
      if (analysed.error) {
        setRetryableAnalysisIds((ids) => [
          ...new Set([...ids, intake.id]),
        ]);
      } else {
        analysisFiles.current.delete(intake.id);
        setRetryableAnalysisIds((ids) =>
          ids.filter((id) => id !== intake.id),
        );
      }
    } catch (caught) {
      updateIntake({
        ...intake,
        status: "needs_review",
        error:
          caught instanceof Error
            ? `${caught.message} The original is safe; review it manually.`
            : "Automatic reading failed. The original is safe; review it manually.",
      });
      setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  async function retryAnalysis(intake: ReceiptIntake) {
    const file = analysisFiles.current.get(intake.id);
    if (!file) return;
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    setRetryableAnalysisIds((ids) => ids.filter((id) => id !== intake.id));
    try {
      const image = await normaliseReceipt(file);
      const analysed = await analyseIntake(intake.id, image);
      updateIntake(analysed);
      if (analysed.error) {
        setRetryableAnalysisIds((ids) => [
          ...new Set([...ids, intake.id]),
        ]);
      } else {
        analysisFiles.current.delete(intake.id);
      }
    } catch (caught) {
      updateIntake({
        ...intake,
        status: "needs_review",
        error: caught instanceof Error ? caught.message : "Automatic reading failed.",
      });
      setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  async function reanalyse(intake: ReceiptIntake) {
    if (!window.confirm("Read this receipt again? AI suggestions and any saved or unsaved corrections in this review will be replaced.")) return;
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    try {
      updateIntake(await reanalyseIntake(intake.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The receipt could not be read again.");
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  async function addFiles(selected: File[]) {
    setError("");
    const candidates = selected.slice(0, MAX_BATCH);
    if (selected.length > MAX_BATCH) {
      setError(`Only the first ${MAX_BATCH} photos were added.`);
    }
    const accepted = candidates.filter((file) => {
      const acceptedFile = canSelectReceipt(file);
      if (!acceptedFile) {
        setError(
          "Some photos were skipped. Use an image no larger than 20 MB.",
        );
      }
      return acceptedFile;
    });
    if (!accepted.length) return;

    const queued = accepted.map<LocalUpload>((file) => ({
      id: identifier(),
      idempotencyKey: identifier(),
      file,
      stage: "queued",
    }));
    setLocalUploads((items) => [...queued, ...items]);
    const batchId = identifier();
    const shared = { ...defaults };
    const work = [...queued];
    await Promise.all(
      Array.from({ length: Math.min(2, work.length) }, async () => {
        let item = work.shift();
        while (item) {
          await processFile(item, batchId, shared);
          item = work.shift();
        }
      }),
    );
  }

  async function remove(intake: ReceiptIntake) {
    if (!window.confirm("Remove this receipt from the intake inbox?")) return;
    try {
      await deleteIntake(intake.id);
      setIntakes((items) => items.filter((item) => item.id !== intake.id));
      if (selectedId === intake.id) setSelectedId("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The receipt could not be removed.",
      );
    }
  }

  const activeCount =
    localUploads.filter((item) => item.stage !== "failed").length +
    processingIds.length;
  const reviewCount = intakes.filter((item) =>
    ["uploaded", "needs_review", "ready"].includes(item.status),
  ).length;
  const voiceAvailable = Boolean(ai?.configured && ai.models.realtime);

  return (
    <div className="receipt-inbox">
      <section className="intake-compose" aria-labelledby="intake-title">
        <div className="intake-intro">
          <div>
            <p className="eyebrow">Receipt inbox</p>
            <h2 id="intake-title">Add the photos. Review the facts.</h2>
          </div>
          <p>
            Originals are secured first. Expense details are only confirmed by
            you.
          </p>
        </div>
        <IntakeDefaults data={data} value={defaults} onChange={setDefaults} />
        <UploadActions busy={localUploads.length >= MAX_BATCH} onFiles={(files) => void addFiles(files)} />
        {ai && !ai.configured ? (
          <div className="ai-state">
            <span aria-hidden="true">i</span>
            <p>
              <strong>AI reading is not configured</strong>
              Photos still upload safely and can be reviewed manually.
            </p>
          </div>
        ) : ai?.configured ? (
          <p className="ai-model-note">
            Receipt reading on · {ai.models.receipt}
            {ai.privacy ? ` · ${ai.privacy}` : ""}
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
        {error ? <p className="intake-error" role="alert">{error}</p> : null}
        {loading ? (
          <div className="queue-loading" role="status">
            <span />
            Loading your receipt inbox…
          </div>
        ) : !localUploads.length && !intakes.length ? (
          <div className="intake-empty">
            <span aria-hidden="true">⌁</span>
            <strong>No receipts waiting</strong>
            <p>Take a photo or choose several from your Photo Library.</p>
          </div>
        ) : (
          <ol className="intake-queue">
            {localUploads.map((item) => (
              <LocalQueueItem
                key={item.id}
                item={item}
                onRetry={() => void processFile(item, identifier(), { ...defaults })}
                onDismiss={() => setLocalUploads((items) => items.filter((entry) => entry.id !== item.id))}
              />
            ))}
            {intakes.map((intake) => (
              <QueueItem
                key={intake.id}
                intake={intake}
                processing={processingIds.includes(intake.id)}
                selected={selectedId === intake.id}
                onSelect={() => setSelectedId(selectedId === intake.id ? "" : intake.id)}
                onDelete={() => void remove(intake)}
              >
                <IntakeReview
                  key={`${intake.id}-${intake.updatedAt}`}
                  intake={intake}
                  data={data}
                  voiceAvailable={voiceAvailable}
                  canRetryAnalysis={retryableAnalysisIds.includes(intake.id)}
                  canReanalyse={Boolean(ai?.configured && intake.hasAnalysisCopy && !["analysing", "confirmed"].includes(intake.status) && !processingIds.includes(intake.id))}
                  analysisModel={ai?.models.receipt ?? ""}
                  onUpdate={updateIntake}
                  onRetryAnalysis={() => void retryAnalysis(intake)}
                  onReanalyse={() => void reanalyse(intake)}
                  onConfirmed={onSaved}
                />
              </QueueItem>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
