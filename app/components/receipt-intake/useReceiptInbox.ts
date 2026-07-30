"use client";

import { useEffect, useRef, useState } from "react";
import { canSelectReceipt, normaliseReceipt } from "./image";
import {
  analyseIntake,
  deleteIntake,
  getAiStatus,
  listIntakes,
  ReceiptApiError,
  reanalyseIntake,
  uploadIntake,
} from "./receiptApi";
import type {
  AiStatus,
  BatchDefaults,
  ImageEdits,
  LocalUpload,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";
import {
  listUploadDrafts,
  removeUploadDraft,
  saveUploadDraft,
} from "./upload-drafts";
import {
  currentBatchDefaults,
  initialBatchDefaultState,
  MAX_UPLOAD_BATCH,
  upsertReceiptIntake,
  uploadIdentifier,
} from "./upload-queue";

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
      await updateLocal(local, {
        stage: "waiting-online",
        error:
          "Waiting on this device. It is not secured until the upload completes.",
      });
      return;
    }
    activeLocalIds.current.add(local.id);
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
      activeLocalIds.current.delete(local.id);
      return;
    }
    if (ai?.configured === false) {
      await removeLocal(local.id);
      activeLocalIds.current.delete(local.id);
      return;
    }
    analysisFiles.current.set(intake.id, local.file);
    current = await updateLocal(current, { stage: "normalising" });
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    try {
      const analysisImage = await normaliseReceipt(local.file);
      const analysed = await analyseIntake(intake.id, analysisImage);
      updateIntake(analysed);
      if (analysed.error) {
        setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
      } else {
        analysisFiles.current.delete(intake.id);
      }
      await removeLocal(local.id);
    } catch (caught) {
      updateIntake({
        ...intake,
        status: "needs_review",
        error:
          caught instanceof Error
            ? `${caught.message} The original is safe; review it manually.`
            : "Automatic reading failed. The original is safe; review it manually.",
      });
      await updateLocal(current, {
        stage: "failed",
        error: caught instanceof Error ? caught.message : "Automatic reading failed.",
      });
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
      // On a failed status check, leave ai unknown (null): uploads still
      // attempt analysis and the server answers with its real state, so a
      // transient status failure cannot silently disable automatic reading.
      if (draftResult.status === "fulfilled") {
        setLocalUploads(draftResult.value);
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
  }, [initialIntakeId]);

  useEffect(() => {
    function resume() {
      uploadsRef.current
        .filter(
          (item) =>
            item.stage === "waiting-online" || item.stage === "queued",
        )
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

  async function retryAnalysis(intake: ReceiptIntake) {
    const file = analysisFiles.current.get(intake.id);
    if (!file) return;
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    try {
      updateIntake(await analyseIntake(intake.id, await normaliseReceipt(file)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Automatic reading failed.");
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  async function reanalyse(
    intake: ReceiptIntake,
    fields: ReceiptRecheckField[],
  ) {
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    try {
      updateIntake(await reanalyseIntake(intake.id, fields));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The receipt could not be read again.");
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  async function analyseWithEdits(intake: ReceiptIntake, edits: ImageEdits) {
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    try {
      const response = await fetch(intake.previewUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("The secured original could not be opened.");
      const image = await normaliseReceipt(await response.blob(), edits);
      updateIntake(await analyseIntake(intake.id, image, edits));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The adjusted receipt could not be read.");
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  async function confirmed(id: string) {
    const pending = intakes.filter((item) => item.id !== id);
    setIntakes(pending);
    setSelectedId(pending[0]?.id ?? "");
    await onSaved();
  }

  async function remove(intake: ReceiptIntake) {
    if (!window.confirm("Remove this receipt from the intake inbox?")) return;
    try {
      await deleteIntake(intake.id);
      setIntakes((items) => items.filter((item) => item.id !== intake.id));
      if (selectedId === intake.id) setSelectedId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The receipt could not be removed.");
    }
  }

  async function clearQueue() {
    const removable = intakes.filter(
      (item) => !["analysing", "confirmed"].includes(item.status),
    );
    const locals = uploadsRef.current.filter(
      (item) => item.stage !== "uploading" && item.stage !== "normalising",
    );
    const total = removable.length + locals.length;
    if (!total) return;
    const confirmed = window.confirm(
      `Remove ${total} receipt${total === 1 ? "" : "s"} and their stored photos from the intake queue? Confirmed expenses are not affected.`,
    );
    if (!confirmed) return;
    setError("");
    for (const item of locals) {
      await removeLocal(item.id);
    }
    const failed = new Set<string>();
    for (const item of removable) {
      try {
        await deleteIntake(item.id);
        analysisFiles.current.delete(item.id);
      } catch {
        failed.add(item.id);
      }
    }
    const removedIds = new Set(
      removable.filter((item) => !failed.has(item.id)).map((item) => item.id),
    );
    setIntakes((items) => items.filter((item) => !removedIds.has(item.id)));
    setRetryableAnalysisIds((ids) => ids.filter((id) => !removedIds.has(id)));
    setSelectedId((selected) => (removedIds.has(selected) ? "" : selected));
    if (failed.size) {
      setError(
        `${failed.size} receipt${failed.size === 1 ? " was" : "s were"} not removed. Analysing or already-confirmed receipts stay in place; try again once they settle.`,
      );
    }
  }

  return {
    ai,
    defaults,
    error,
    intakes,
    loading,
    localUploads,
    processingIds,
    retryableAnalysisIds,
    selectedId,
    setDefaults: (value: BatchDefaults) =>
      setDefaultState({ seed: initialSeed, value }),
    setError,
    setSelectedId,
    addFiles,
    analyseWithEdits,
    clearQueue,
    confirmed,
    dismissLocal: removeLocal,
    processFile,
    reanalyse,
    remove,
    retryAnalysis,
    updateIntake,
  };
}
