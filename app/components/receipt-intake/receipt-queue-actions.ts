"use client";

import type {
  Dispatch,
  SetStateAction,
} from "react";
import { deleteIntake } from "./receiptApi";
import type { useReceiptAnalysisActions } from "./receipt-analysis-actions";
import type { LocalUpload, ReceiptIntake } from "./types";
import type { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";

type AnalysisActions = ReturnType<typeof useReceiptAnalysisActions>;
type ProcessingTracker = ReturnType<typeof useReceiptProcessingTracker>;

export function useReceiptQueueActions({
  intakes,
  selectedId,
  getUploads,
  getAnalysisFile,
  deleteAnalysisFile,
  scheduleFile,
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
  getUploads: () => LocalUpload[];
  getAnalysisFile: (id: string) => File | undefined;
  deleteAnalysisFile: (id: string) => void;
  scheduleFile: (item: LocalUpload) => Promise<void>;
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
      (item) => item.status !== "confirmed",
    );
    const locals = getUploads().filter(
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
        deleteAnalysisFile(item.id);
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
        `${failed.size} receipt${failed.size === 1 ? " was" : "s were"} not removed. A current AI check is still protected; stop waiting and try Remove again shortly.`,
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
        const local = getUploads().find((item) => item.id === job.id);
        if (local) {
          void scheduleFile(local);
          return;
        }
        const mappedIntake = job.intakeId
          ? intakes.find((item) => item.id === job.intakeId)
          : null;
        if (mappedIntake) {
          processing.remove([job.id]);
          if (mappedIntake.status === "ready") {
            void analysisActions.retryAutomaticConfirmation(
              mappedIntake,
              `analysis:${mappedIntake.id}`,
            );
          } else if (
            mappedIntake.status === "uploaded" ||
            mappedIntake.status === "needs_review" ||
            mappedIntake.status === "failed"
          ) {
            void analysisActions.reanalyse(mappedIntake, []);
          }
          return;
        }
        if (job.id.startsWith("analysis:")) {
          const intake = intakes.find(
            (item) => `analysis:${item.id}` === job.id,
          );
          if (intake) {
            if (getAnalysisFile(intake.id)) {
              void analysisActions.retryAnalysis(intake);
            } else if (intake.hasAnalysisCopy) {
              void analysisActions.reanalyse(intake, []);
            }
          }
          return;
        }
      });
  }

  return { clearQueue, remove, retryBlockedProcessing };
}
