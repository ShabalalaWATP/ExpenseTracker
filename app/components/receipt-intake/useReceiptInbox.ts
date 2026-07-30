"use client";

import { useEffect, useRef, useState } from "react";
import { receiptAnalysisImage } from "./image";
import {
  analyseIntake,
  ReceiptApiError,
  uploadIntake,
} from "./receiptApi";
import type { AiStatus, BatchDefaults, LocalUpload, ReceiptIntake } from "./types";
import {
  currentBatchDefaults,
  initialBatchDefaultState,
  upsertReceiptIntake,
} from "./upload-queue";
import { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";
import { createReceiptAnalysisActions, finishReceiptAnalysis } from "./receipt-analysis-actions";
import { createReceiptQueueActions } from "./receipt-queue-actions";
import { AutoConfirmationPendingError } from "./auto-confirm-polling";
import { enqueueReceiptFiles } from "./receipt-file-queue";
import { useLocalUploadQueue } from "./useLocalUploadQueue";
import {
  cancelReceiptRequests,
  finishReceiptRequest,
  newReceiptRequestControl,
} from "./request-control";
import { useInitialReceiptInbox } from "./useInitialReceiptInbox";

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
  const {
    localUploads,
    removeLocal,
    setLocalUploads,
    updateLocal,
    uploadsRef,
  } = useLocalUploadQueue();
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
  const requestControl = useRef(newReceiptRequestControl()).current;
  const processRef = useRef<(item: LocalUpload) => Promise<void>>(async () => {});
  const analysisFiles = useRef(new Map<string, File>());
  const processing = useReceiptProcessingTracker();
  const beginProcessing = processing.begin;
  function updateIntake(next: ReceiptIntake) {
    setIntakes((items) => upsertReceiptIntake(items, next));
  }
  async function processFile(local: LocalUpload) {
    if (
      requestControl.active.has(local.id) ||
      requestControl.cancelled.has(local.id)
    ) return;
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
    requestControl.active.add(local.id);
    const controller = new AbortController();
    requestControl.controllers.set(local.id, controller);
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
        controller.signal,
      );
      updateIntake(intake);
      setSelectedId((selected) => selected || intake.id);
    } catch (caught) {
      if (
        requestControl.cancelled.has(local.id) ||
        (caught instanceof ReceiptApiError &&
          caught.code === "request_cancelled")
      ) {
        await removeLocal(local.id);
        processing.remove([local.id]);
        finishReceiptRequest(requestControl, local.id);
        return;
      }
      if (
        caught instanceof ReceiptApiError &&
        caught.code === "receipt_duplicate"
      ) {
        await removeLocal(local.id);
        processing.remove([local.id]);
        setError(
          `${local.file.name} was stopped because this exact receipt is already stored.`,
        );
        finishReceiptRequest(requestControl, local.id);
        return;
      }
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
      finishReceiptRequest(requestControl, local.id);
      return;
    }
    if (requestControl.cancelled.has(local.id)) {
      await removeLocal(local.id);
      processing.remove([local.id]);
      finishReceiptRequest(requestControl, local.id);
      return;
    }
    if (ai?.configured === false) {
      processing.mark(local.id, "completed", { secured: true });
      await removeLocal(local.id);
      finishReceiptRequest(requestControl, local.id);
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
      const analysisImage = await receiptAnalysisImage(local.file);
      if (controller.signal.aborted) {
        throw new ReceiptApiError(
          "Processing was cancelled. The secured original remains in your inbox.",
          false,
          "request_cancelled",
        );
      }
      processing.mark(local.id, "analysing", { secured: true });
      analysedIntake = await analyseIntake(
        intake.id,
        analysisImage,
        undefined,
        controller.signal,
      );
      const analysed = await finishReceiptAnalysis(
        analysedIntake,
        local.id,
        processing,
        updateIntake,
        () => controller.signal.aborted,
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
      if (
        requestControl.cancelled.has(local.id) ||
        (caught instanceof ReceiptApiError &&
          caught.code === "request_cancelled")
      ) {
        await removeLocal(local.id);
        processing.remove([local.id]);
        setError(
          "Stopped waiting for AI. The original is safe; the server may finish the current check, or you can retry after it reports an exception.",
        );
        setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
        return;
      }
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
      finishReceiptRequest(requestControl, local.id);
    }
  }
  useEffect(() => {
    processRef.current = processFile;
  });
  useInitialReceiptInbox({
    initialIntakeId,
    beginProcessing,
    processRef,
    setAi,
    setError,
    setIntakes,
    setSelectedId,
    setLocalUploads,
    setLoading,
  });

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
  }, [uploadsRef]);

  async function addFiles(selected: File[]) {
    await enqueueReceiptFiles({
      selected,
      defaults,
      processing,
      setError,
      setLocalUploads,
      processFile,
      isCancelled: (id) => requestControl.cancelled.has(id),
    });
  }

  async function cancelProcessing(id: string) {
    cancelReceiptRequests(requestControl, [id]);
    processing.remove([id]);
    await removeLocal(id);
  }

  async function cancelAllProcessing() {
    const ids = uploadsRef.current.map((item) => item.id);
    cancelReceiptRequests(requestControl, ids);
    processing.remove(ids);
    await Promise.all(ids.map((id) => removeLocal(id)));
    setError(
      "Stopped waiting. Any original already secured remains available in the inbox; a server check already under way may still finish.",
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
    cancelAllProcessing,
    cancelProcessing,
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
