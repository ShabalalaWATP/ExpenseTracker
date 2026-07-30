"use client";

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { deleteIntake } from "./receiptApi";
import type { createReceiptAnalysisActions } from "./receipt-analysis-actions";
import type { LocalUpload, ReceiptIntake } from "./types";
import type { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";

type AnalysisActions = ReturnType<typeof createReceiptAnalysisActions>;
type ProcessingTracker = ReturnType<typeof useReceiptProcessingTracker>;

export function createReceiptQueueActions({
  intakes,
  selectedId,
  uploadsRef,
  analysisFiles,
  processRef,
  processing,
  analysisActions,
  removeLocal,
  setIntakes,
  setSelectedId,
  setRetryableAnalysisIds,
  setError,
}: {
  intakes: ReceiptIntake[];
  selectedId: string;
  uploadsRef: MutableRefObject<LocalUpload[]>;
  analysisFiles: MutableRefObject<Map<string, File>>;
  processRef: MutableRefObject<(item: LocalUpload) => Promise<void>>;
  processing: ProcessingTracker;
  analysisActions: AnalysisActions;
  removeLocal: (id: string) => Promise<void>;
  setIntakes: Dispatch<SetStateAction<ReceiptIntake[]>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setRetryableAnalysisIds: Dispatch<SetStateAction<string[]>>;
  setError: Dispatch<SetStateAction<string>>;
}) {
  async function remove(intake: ReceiptIntake) {
    if (!window.confirm("Remove this receipt from the intake inbox?")) return;
    try {
      await deleteIntake(intake.id);
      setIntakes((items) => items.filter((item) => item.id !== intake.id));
      if (selectedId === intake.id) setSelectedId("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The receipt could not be removed.",
      );
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
    if (
      !total ||
      !window.confirm(
        `Remove ${total} receipt${total === 1 ? "" : "s"} and their stored photos from the intake queue? Confirmed expenses are not affected.`,
      )
    ) {
      return;
    }
    setError("");
    for (const item of locals) await removeLocal(item.id);
    const failed = new Set<string>();
    for (const item of removable) {
      try {
        await deleteIntake(item.id);
        analysisFiles.current.delete(item.id);
      } catch {
        failed.add(item.id);
      }
    }
    const removed = new Set(
      removable.filter((item) => !failed.has(item.id)).map((item) => item.id),
    );
    setIntakes((items) => items.filter((item) => !removed.has(item.id)));
    setRetryableAnalysisIds((ids) => ids.filter((id) => !removed.has(id)));
    setSelectedId((selected) => (removed.has(selected) ? "" : selected));
    if (failed.size) {
      setError(
        `${failed.size} receipt${failed.size === 1 ? " was" : "s were"} not removed. Analysing or already-confirmed receipts stay in place; try again once they settle.`,
      );
    }
  }

  function retryBlockedProcessing() {
    processing.summary.jobs
      .filter(
        (job) =>
          job.stage === "failed" ||
          job.stage === "waiting" ||
          job.stage === "pending",
      )
      .forEach((job) => {
        if (job.id.startsWith("analysis:")) {
          const intake = intakes.find(
            (item) => `analysis:${item.id}` === job.id,
          );
          if (intake) {
            if (analysisFiles.current.has(intake.id)) {
              void analysisActions.retryAnalysis(intake);
            } else if (intake.hasAnalysisCopy) {
              void analysisActions.reanalyse(intake, []);
            }
          }
          return;
        }
        const local = uploadsRef.current.find((item) => item.id === job.id);
        const ready = local?.intakeId
          ? intakes.find((item) => item.id === local.intakeId)
          : null;
        if (local && ready?.status === "ready") {
          void analysisActions
            .retryAutomaticConfirmation(ready, local.id)
            .then((succeeded) => {
              if (succeeded) void removeLocal(local.id);
            });
        } else if (local) {
          void processRef.current(local);
        }
      });
  }

  return { clearQueue, remove, retryBlockedProcessing };
}
