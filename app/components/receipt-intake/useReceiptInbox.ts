"use client";

import { useEffect, useRef, useState } from "react";
import { canSelectReceipt, normaliseReceipt } from "./image";
import {
  analyseIntake,
  getAiStatus,
  listIntakes,
  ReceiptApiError,
  uploadIntake,
} from "./receiptApi";
import type { AiStatus, BatchDefaults, LocalUpload, ReceiptIntake } from "./types";
import { listUploadDrafts, removeUploadDraft, saveUploadDraft } from "./upload-drafts";
import {
  currentBatchDefaults,
  initialBatchDefaultState,
  MAX_UPLOAD_BATCH,
  upsertReceiptIntake,
  uploadIdentifier,
} from "./upload-queue";
import { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";
import { createReceiptAnalysisActions, finishReceiptAnalysis } from "./receipt-analysis-actions";
import { createReceiptQueueActions } from "./receipt-queue-actions";
import { AutoConfirmationPendingError } from "./auto-confirm-polling";

export function useReceiptInbox({
  initialDate,
  initialIntakeId,
  onSaved,
}: {
  initialDate?: string;
  initialIntakeId?: string;
  onSaved: () => Promise<void>;
}) {
  const [intakes, setIntakes] = useState<ReceiptIntake[]>([]);
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [retryableAnalysisIds, setRetryableAnalysisIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(initialIntakeId ?? "");
  const initialSeed = initialDate ?? "";
  const [defaultState, setDefaultState] = useState(() =>
    initialBatchDefaultState(initialSeed),
  );
  const defaults = currentBatchDefaults(defaultState, initialSeed);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeLocalIds = useRef(new Set<string>());
  const processRef = useRef<(item: LocalUpload) => Promise<void>>(async () => {});
  const analysisFiles = useRef(new Map<string, File>());
  const uploadsRef = useRef<LocalUpload[]>([]);
  const processing = useReceiptProcessingTracker();
  const beginProcessing = processing.begin;
  async function updateLocal(
    local: LocalUpload,
    changes: Partial<LocalUpload>,
  ): Promise<LocalUpload> {
    const changed = { ...local, ...changes };
    setLocalUploads((items) =>
      items.map((item) => (item.id === local.id ? changed : item)),
    );
    await saveUploadDraft(changed).catch(() => {});
    return changed;
  }
  function updateIntake(next: ReceiptIntake) {
    setIntakes((items) => upsertReceiptIntake(items, next));
  }
  async function removeLocal(id: string) {
    setLocalUploads((items) => items.filter((item) => item.id !== id));
    await removeUploadDraft(id).catch(() => {});
  }
  async function processFile(local: LocalUpload) {
    if (activeLocalIds.current.has(local.id)) return;
    if (!navigator.onLine) {
      processing.mark(local.id, "waiting", {
        error: "Waiting for a connection.",
      });
      await updateLocal(local, {
        stage: "waiting-online",
        error:
          "Waiting on this device. It is not secured until the upload completes.",
      });
      return;
    }
    activeLocalIds.current.add(local.id);
    processing.mark(local.id, "uploading");
    let current = await updateLocal(local, {
      stage: "uploading",
      attempts: local.attempts + 1,
      error: undefined,
    });
    let intake: ReceiptIntake;
    try {
      intake = await uploadIntake(
        local.file,
        local.batchId,
        local.defaults,
        local.idempotencyKey,
      );
      updateIntake(intake);
      setSelectedId((selected) => selected || intake.id);
    } catch (caught) {
      const retryable =
        !navigator.onLine ||
        (caught instanceof ReceiptApiError && caught.retryable);
      current = await updateLocal(current, {
        stage: retryable ? "waiting-online" : "failed",
        error: caught instanceof Error ? caught.message : "Upload failed.",
      });
      processing.mark(local.id, retryable ? "waiting" : "failed", {
        error: current.error,
      });
      activeLocalIds.current.delete(local.id);
      return;
    }
    if (ai?.configured === false) {
      processing.mark(local.id, "completed", { secured: true });
      await removeLocal(local.id);
      activeLocalIds.current.delete(local.id);
      return;
    }
    analysisFiles.current.set(intake.id, local.file);
    processing.mark(local.id, "preparing", { secured: true });
    current = await updateLocal(current, {
      stage: "normalising",
      intakeId: intake.id,
    });
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    let analysedIntake: ReceiptIntake | null = null;
    try {
      const analysisImage = await normaliseReceipt(local.file);
      processing.mark(local.id, "analysing", { secured: true });
      analysedIntake = await analyseIntake(intake.id, analysisImage);
      const analysed = await finishReceiptAnalysis(
        analysedIntake,
        local.id,
        processing,
        updateIntake,
      );
      updateIntake(analysed);
      if (analysed.status === "confirmed") {
        await confirmed(analysed.id);
      } else if (analysed.error) {
        setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
      } else {
        analysisFiles.current.delete(intake.id);
      }
      processing.mark(local.id, "completed", { secured: true });
      await removeLocal(local.id);
    } catch (caught) {
      if (!analysedIntake) {
        updateIntake({
          ...intake,
          status: "needs_review",
          error:
            caught instanceof Error
              ? `${caught.message} The original is safe; review it manually.`
              : "Automatic reading failed. The original is safe; review it manually.",
        });
      }
      await updateLocal(current, {
        stage: "failed",
        error: caught instanceof Error ? caught.message : "Automatic reading failed.",
      });
      processing.mark(
        local.id,
        caught instanceof AutoConfirmationPendingError ? "pending" : "failed",
        {
          secured: true,
          error:
            caught instanceof Error
              ? caught.message
              : "Automatic reading failed.",
        },
      );
      setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
      activeLocalIds.current.delete(local.id);
    }
  }
  useEffect(() => {
    uploadsRef.current = localUploads;
    processRef.current = processFile;
  });
  useEffect(() => {
    let current = true;
    void Promise.allSettled([
      listIntakes(),
      getAiStatus(),
      listUploadDrafts(),
    ]).then(([intakeResult, aiResult, draftResult]) => {
      if (!current) return;
      if (intakeResult.status === "fulfilled") {
        setIntakes(intakeResult.value);
        setSelectedId((selected) =>
          selected && intakeResult.value.some((item) => item.id === selected)
            ? selected
            : initialIntakeId ?? intakeResult.value[0]?.id ?? "",
        );
      } else {
        setError("The receipt inbox could not be loaded.");
      }
      if (aiResult.status === "fulfilled") setAi(aiResult.value);
      if (draftResult.status === "fulfilled") {
        setLocalUploads(draftResult.value);
        beginProcessing(
          draftResult.value.map((item) => ({
            id: item.id,
            name: item.file.name,
            waiting: item.stage === "waiting-online",
          })),
        );
        draftResult.value.forEach((item) => void processRef.current(item));
      } else {
        setError(
          "Safari could not open the local recovery queue. New photos can still upload while this page remains open.",
        );
      }
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [beginProcessing, initialIntakeId]);

  useEffect(() => {
    function resume() {
      uploadsRef.current
        .filter((item) =>
          item.stage === "waiting-online" || item.stage === "queued")
        .forEach((item) => void processRef.current(item));
    }
    function visible() {
      if (document.visibilityState === "visible") resume();
    }
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  async function addFiles(selected: File[]) {
    setError("");
    const supported = selected.filter(canSelectReceipt);
    const candidates = supported.slice(0, MAX_UPLOAD_BATCH);
    if (supported.length !== selected.length) {
      setError("Some files were skipped. Choose receipt images up to 20 MB.");
    }
    if (selected.length > MAX_UPLOAD_BATCH) {
      setError(`Only the first ${MAX_UPLOAD_BATCH} photos were added.`);
    }
    const batchId = uploadIdentifier();
    const shared = { ...defaults };
    const queued = candidates.map<LocalUpload>((file) => ({
      id: uploadIdentifier(),
      idempotencyKey: uploadIdentifier(),
      batchId,
      defaults: shared,
      file,
      stage: navigator.onLine ? "queued" : "waiting-online",
      attempts: 0,
    }));
    processing.begin(
      queued.map((item) => ({
        id: item.id,
        name: item.file.name,
        waiting: item.stage === "waiting-online",
      })),
    );
    const stored: LocalUpload[] = [];
    for (const item of queued) {
      try {
        await saveUploadDraft(item);
        stored.push(item);
      } catch {
        stored.push(item);
        setError(
          "Safari could not preserve one photo for recovery. Its upload is starting now, but keep this page open until it is secured.",
        );
      }
    }
    setLocalUploads((items) => [...stored, ...items]);
    const work = [...stored];
    await Promise.all(
      Array.from({ length: Math.min(2, work.length) }, async () => {
        let item = work.shift();
        while (item) {
          await processFile(item);
          item = work.shift();
        }
      }),
    );
  }

  async function confirmed(id: string) {
    setIntakes((current) => current.filter((item) => item.id !== id));
    setSelectedId((selected) => (selected === id ? "" : selected));
    await onSaved();
  }

  const analysisActions = createReceiptAnalysisActions({
    analysisFiles,
    processing,
    setProcessingIds,
    setError,
    updateIntake,
    confirmed,
  });
  const queueActions = createReceiptQueueActions({
    intakes, selectedId, uploadsRef, analysisFiles, processRef, processing,
    analysisActions, removeLocal, setIntakes, setSelectedId,
    setRetryableAnalysisIds, setError,
  });

  return {
    ai,
    defaults,
    error,
    intakes,
    loading,
    localUploads,
    processingIds,
    processing: processing.summary,
    retryableAnalysisIds,
    selectedId,
    setDefaults: (value: BatchDefaults) =>
      setDefaultState({ seed: initialSeed, value }),
    setError,
    setSelectedId,
    addFiles,
    analyseWithEdits: analysisActions.analyseWithEdits,
    clearQueue: queueActions.clearQueue,
    confirmed,
    dismissLocal: removeLocal,
    processFile,
    reanalyse: analysisActions.reanalyse,
    remove: queueActions.remove,
    retryAnalysis: analysisActions.retryAnalysis,
    retryBlockedProcessing: queueActions.retryBlockedProcessing,
    dismissProcessing: processing.dismissBlocked,
    updateIntake,
  };
}
