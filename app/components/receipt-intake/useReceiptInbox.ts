"use client";

import { useEffect, useRef, useState } from "react";
import type { AiStatus, BatchDefaults, LocalUpload, ReceiptIntake } from "./types";
import {
  availableReceiptUploadSlots,
  currentBatchDefaults,
  initialBatchDefaultState,
  upsertReceiptIntake,
} from "./upload-queue";
import { useReceiptAnalysisActions } from "./receipt-analysis-actions";
import { useReceiptQueueActions } from "./receipt-queue-actions";
import { enqueueReceiptFiles } from "./receipt-file-queue";
import { useLocalUploadQueue } from "./useLocalUploadQueue";
import { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";
import {
  cancelReceiptRequests,
  newReceiptRequestControl,
} from "./request-control";
import { useInitialReceiptInbox } from "./useInitialReceiptInbox";
import { ReceiptWorkScheduler } from "./receipt-work-scheduler";
import { useReceiptUploadProcessor } from "./receipt-upload-processor";
import { receiptAnalysisImage } from "./image";

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
  const [requestControl] = useState(newReceiptRequestControl);
  const [scheduler] = useState(() => new ReceiptWorkScheduler(2));
  const [imageScheduler] = useState(() => new ReceiptWorkScheduler(1));
  const workerRef = useRef<(item: LocalUpload) => Promise<void>>(
    async () => {},
  );
  const processRef = useRef<(item: LocalUpload) => Promise<void>>(
    (item) => scheduler.schedule(item.id, () => workerRef.current(item)),
  );
  const scheduleFile = (item: LocalUpload) =>
    scheduler.schedule(item.id, () => workerRef.current(item));
  const prepareAnalysisImage = (id: string, file: File) =>
    imageScheduler.schedule(id, () => receiptAnalysisImage(file));
  const analysisFiles = useRef(new Map<string, File>());
  const getAnalysisFile = (id: string) => analysisFiles.current.get(id);
  const setAnalysisFile = (id: string, file: File) => {
    analysisFiles.current.set(id, file);
  };
  const deleteAnalysisFile = (id: string) => {
    analysisFiles.current.delete(id);
  };
  const getUploads = () => uploadsRef.current;
  const processing = useReceiptProcessingTracker();
  const beginProcessing = processing.begin;
  function updateIntake(next: ReceiptIntake) {
    setIntakes((items) => upsertReceiptIntake(items, next));
  }

  async function confirmed(id: string) {
    setIntakes((current) => current.filter((item) => item.id !== id));
    setSelectedId((selected) => (selected === id ? "" : selected));
    await onSaved();
  }

  const processFile = useReceiptUploadProcessor({
    ai,
    requestControl,
    processing,
    setAnalysisFile,
    deleteAnalysisFile,
    updateLocal,
    removeLocal,
    updateIntake,
    confirmed,
    setSelectedId,
    setProcessingIds,
    setRetryableAnalysisIds,
    setError,
    prepareAnalysisImage,
  });
  useEffect(() => {
    workerRef.current = processFile;
  }, [processFile]);
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
    const availableSlots = availableReceiptUploadSlots(
      uploadsRef.current.length,
    );
    await enqueueReceiptFiles({
      selected,
      defaults,
      processing,
      setError,
      setLocalUploads,
      scheduleFile,
      isCancelled: (id) => requestControl.cancelled.has(id),
      availableSlots,
    });
  }

  async function cancelProcessing(id: string) {
    scheduler.cancelPending(id);
    imageScheduler.cancelPending(id);
    cancelReceiptRequests(requestControl, [id]);
    processing.remove([id]);
    await removeLocal(id);
  }

  async function cancelAllProcessing() {
    const ids = uploadsRef.current.map((item) => item.id);
    ids.forEach((id) => scheduler.cancelPending(id));
    ids.forEach((id) => imageScheduler.cancelPending(id));
    cancelReceiptRequests(requestControl, ids);
    processing.remove(ids);
    await Promise.all(ids.map((id) => removeLocal(id)));
    setError(
      "Stopped waiting. Any original already secured remains available in the inbox; a server check already under way may still finish.",
    );
  }

  const rawAnalysisActions = useReceiptAnalysisActions({
    getAnalysisFile,
    processing,
    setProcessingIds,
    setError,
    updateIntake,
    confirmed,
  });
  const analysisActions = {
    retryAutomaticConfirmation: (
      intake: ReceiptIntake,
      jobId: string,
    ) =>
      scheduler.schedule(`analysis:${intake.id}`, () =>
        rawAnalysisActions.retryAutomaticConfirmation(intake, jobId),
      ),
    retryAnalysis: (intake: ReceiptIntake) =>
      scheduler.schedule(`analysis:${intake.id}`, () =>
        rawAnalysisActions.retryAnalysis(intake),
      ),
    reanalyse: (
      intake: ReceiptIntake,
      fields: Parameters<typeof rawAnalysisActions.reanalyse>[1],
    ) =>
      scheduler.schedule(`analysis:${intake.id}`, () =>
        rawAnalysisActions.reanalyse(intake, fields),
      ),
    analyseWithEdits: (
      intake: ReceiptIntake,
      edits: Parameters<typeof rawAnalysisActions.analyseWithEdits>[1],
    ) =>
      scheduler.schedule(`analysis:${intake.id}`, () =>
        rawAnalysisActions.analyseWithEdits(intake, edits),
      ),
  };
  const queueActions = useReceiptQueueActions({
    intakes, selectedId, getUploads, getAnalysisFile, deleteAnalysisFile,
    scheduleFile,
    processing, analysisActions, removeLocal, setIntakes, setSelectedId,
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
    processFile: scheduleFile,
    reanalyse: analysisActions.reanalyse,
    remove: queueActions.remove,
    retryAnalysis: analysisActions.retryAnalysis,
    retryBlockedProcessing: queueActions.retryBlockedProcessing,
    dismissProcessing: processing.dismissBlocked,
    updateIntake,
  };
}
