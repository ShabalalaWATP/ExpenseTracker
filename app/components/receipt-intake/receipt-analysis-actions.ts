"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { normaliseReceipt } from "./image";
import {
  analyseIntake,
  autoConfirmIntake,
  reanalyseIntake,
} from "./receiptApi";
import type {
  ImageEdits,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";
import type { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";
import {
  AutoConfirmationPendingError,
  pollAutoConfirmation,
} from "./auto-confirm-polling";

type ProcessingTracker = ReturnType<typeof useReceiptProcessingTracker>;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function finishReceiptAnalysis(
  intake: ReceiptIntake,
  jobId: string,
  processing: ProcessingTracker,
  onAnalysed?: (intake: ReceiptIntake) => void,
  isCancelled?: () => boolean,
): Promise<ReceiptIntake> {
  onAnalysed?.(intake);
  processing.mark(jobId, "validating", { secured: true });
  await nextPaint();
  if (intake.status !== "ready" || isCancelled?.()) return intake;
  processing.mark(jobId, "confirming", { secured: true });
  return (
    await pollAutoConfirmation(() => autoConfirmIntake(intake.id))
  ).intake;
}

export function createReceiptAnalysisActions({
  analysisFiles,
  processing,
  setProcessingIds,
  setError,
  updateIntake,
  confirmed,
}: {
  analysisFiles: MutableRefObject<Map<string, File>>;
  processing: ProcessingTracker;
  setProcessingIds: Dispatch<SetStateAction<string[]>>;
  setError: Dispatch<SetStateAction<string>>;
  updateIntake: (intake: ReceiptIntake) => void;
  confirmed: (id: string) => Promise<void>;
}) {
  async function run(
    intake: ReceiptIntake,
    start: "preparing" | "analysing",
    action: (jobId: string) => Promise<ReceiptIntake>,
    fallback: string,
  ) {
    const jobId = `analysis:${intake.id}`;
    processing.begin([{ id: jobId, name: intake.originalName }]);
    processing.mark(jobId, start, { secured: true });
    setProcessingIds((ids) => [...new Set([...ids, intake.id])]);
    try {
      const analysed = await finishReceiptAnalysis(
        await action(jobId),
        jobId,
        processing,
        updateIntake,
      );
      updateIntake(analysed);
      if (analysed.status === "confirmed") await confirmed(analysed.id);
      processing.mark(jobId, "completed", { secured: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : fallback;
      setError(message);
      processing.mark(
        jobId,
        caught instanceof AutoConfirmationPendingError ? "pending" : "failed",
        {
        secured: true,
        error: message,
        },
      );
    } finally {
      setProcessingIds((ids) => ids.filter((id) => id !== intake.id));
    }
  }

  return {
    retryAutomaticConfirmation: async (
      intake: ReceiptIntake,
      jobId: string,
    ): Promise<boolean> => {
      processing.mark(jobId, "confirming", { secured: true });
      try {
        const confirmedIntake = (
          await pollAutoConfirmation(() => autoConfirmIntake(intake.id))
        ).intake;
        updateIntake(confirmedIntake);
        if (confirmedIntake.status === "confirmed") {
          await confirmed(confirmedIntake.id);
        }
        processing.mark(jobId, "completed", { secured: true });
        return true;
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Automatic confirmation was interrupted.";
        setError(message);
        processing.mark(
          jobId,
          caught instanceof AutoConfirmationPendingError
            ? "pending"
            : "failed",
          { secured: true, error: message },
        );
        return false;
      }
    },
    retryAnalysis: async (intake: ReceiptIntake) => {
      const file = analysisFiles.current.get(intake.id);
      if (!file) return;
      await run(
        intake,
        "preparing",
        async (jobId) => {
          const image = await normaliseReceipt(file);
          processing.mark(jobId, "analysing", { secured: true });
          return analyseIntake(intake.id, image);
        },
        "Automatic reading failed.",
      );
    },
    reanalyse: (intake: ReceiptIntake, fields: ReceiptRecheckField[]) =>
      run(
        intake,
        intake.hasAnalysisCopy ? "analysing" : "preparing",
        async (jobId) => {
          if (intake.hasAnalysisCopy) {
            return reanalyseIntake(intake.id, fields);
          }
          const response = await fetch(intake.previewUrl, {
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error("The secured original could not be opened.");
          }
          const image = await normaliseReceipt(await response.blob());
          processing.mark(jobId, "analysing", { secured: true });
          return analyseIntake(intake.id, image);
        },
        "The receipt could not be read again.",
      ),
    analyseWithEdits: (intake: ReceiptIntake, edits: ImageEdits) =>
      run(
        intake,
        "preparing",
        async (jobId) => {
          const response = await fetch(intake.previewUrl, {
            cache: "no-store",
          });
          if (!response.ok) {
            throw new Error("The secured original could not be opened.");
          }
          const image = await normaliseReceipt(await response.blob(), edits);
          processing.mark(jobId, "analysing", { secured: true });
          return analyseIntake(intake.id, image, edits);
        },
        "The adjusted receipt could not be read.",
      ),
  };
}
