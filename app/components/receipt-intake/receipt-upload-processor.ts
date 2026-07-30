"use client";

import type {
  Dispatch,
  SetStateAction,
} from "react";
import {
  analyseIntake,
  listIntakes,
  ReceiptApiError,
  uploadIntake,
} from "./receiptApi";
import {
  pollAnalysingReceipt,
  receiptRecoveryAction,
  ReceiptRecoveryPendingError,
} from "./receipt-recovery";
import { finishReceiptAnalysis } from "./receipt-analysis-actions";
import { receiptAnalysisCompletion } from "./processing-state";
import {
  finishReceiptRequest,
  type ReceiptRequestControl,
} from "./request-control";
import type {
  AiStatus,
  LocalUpload,
  ReceiptIntake,
} from "./types";
import type { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";
import { AutoConfirmationPendingError } from "./auto-confirm-polling";

type ProcessingTracker = ReturnType<typeof useReceiptProcessingTracker>;

type ProcessorOptions = {
  ai: AiStatus | null;
  requestControl: ReceiptRequestControl;
  processing: ProcessingTracker;
  setAnalysisFile: (id: string, file: File) => void;
  deleteAnalysisFile: (id: string) => void;
  updateLocal: (
    local: LocalUpload,
    changes: Partial<LocalUpload>,
  ) => Promise<LocalUpload>;
  removeLocal: (id: string) => Promise<void>;
  updateIntake: (intake: ReceiptIntake) => void;
  confirmed: (id: string) => Promise<void>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setProcessingIds: Dispatch<SetStateAction<string[]>>;
  setRetryableAnalysisIds: Dispatch<SetStateAction<string[]>>;
  setError: Dispatch<SetStateAction<string>>;
  prepareAnalysisImage: (id: string, file: File) => Promise<Blob>;
};

export function useReceiptUploadProcessor(options: ProcessorOptions) {
  const {
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
  } = options;

  async function authoritativeIntake(
    local: LocalUpload,
    signal: AbortSignal,
  ): Promise<ReceiptIntake> {
    if (local.intakeId) {
      const existing = (await listIntakes(signal)).find(
        (intake) => intake.id === local.intakeId,
      );
      if (existing) return existing;
    }
    return uploadIntake(
      local.file,
      local.batchId,
      local.defaults,
      local.idempotencyKey,
      signal,
    );
  }

  async function settle(
    local: LocalUpload,
    intake: ReceiptIntake,
  ): Promise<void> {
    updateIntake(intake);
    deleteAnalysisFile(intake.id);
    await removeLocal(local.id);
    if (intake.status === "confirmed") {
      processing.mark(local.id, "completed", {
        secured: true,
        intakeId: intake.id,
      });
      await confirmed(intake.id);
      return;
    }
    const completion = receiptAnalysisCompletion(intake);
    if (intake.status === "needs_review" && !completion.error) {
      processing.remove([local.id]);
      return;
    }
    if (completion.error || intake.status === "failed") {
      const message =
        completion.error ??
        intake.error ??
        "This receipt needs another reading attempt.";
      processing.mark(local.id, "failed", {
        secured: true,
        intakeId: intake.id,
        error: message,
      });
      setRetryableAnalysisIds((ids) => [...new Set([...ids, intake.id])]);
      setError(message);
      return;
    }
    processing.mark(local.id, "completed", {
      secured: true,
      intakeId: intake.id,
    });
  }

  return async function processFile(local: LocalUpload): Promise<void> {
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
    processing.mark(local.id, local.intakeId ? "validating" : "uploading");
    let current = await updateLocal(local, {
      stage: local.intakeId ? "normalising" : "uploading",
      attempts: local.attempts + 1,
      error: undefined,
    });
    let intake: ReceiptIntake | null = null;

    try {
      intake = await authoritativeIntake(current, controller.signal);
      updateIntake(intake);
      setSelectedId((selected) => selected || intake!.id);
      current = await updateLocal(current, {
        stage: "normalising",
        intakeId: intake.id,
      });
      if (requestControl.cancelled.has(local.id)) {
        await removeLocal(local.id);
        processing.remove([local.id]);
        return;
      }
      if (ai?.configured === false) {
        processing.mark(local.id, "completed", { secured: true });
        await removeLocal(local.id);
        return;
      }

      setAnalysisFile(intake.id, local.file);
      let action = receiptRecoveryAction(intake.status);
      if (action === "poll") {
        processing.mark(local.id, "analysing", {
          secured: true,
          intakeId: intake.id,
        });
        const reconciled = await pollAnalysingReceipt(
          intake.id,
          () => listIntakes(controller.signal),
        );
        intake =
          reconciled ??
          (await uploadIntake(
            local.file,
            local.batchId,
            local.defaults,
            local.idempotencyKey,
            controller.signal,
          ));
        action = receiptRecoveryAction(intake.status);
        if (action === "poll") throw new ReceiptRecoveryPendingError();
      }

      if (action === "cleanup" || action === "show") {
        await settle(local, intake);
        return;
      }

      setProcessingIds((ids) => [...new Set([...ids, intake!.id])]);
      let analysed = intake;
      if (action === "analyse") {
        processing.mark(local.id, "preparing", {
          secured: true,
          intakeId: intake.id,
        });
        const image = await prepareAnalysisImage(local.id, local.file);
        if (controller.signal.aborted) {
          throw new ReceiptApiError(
            "Processing was cancelled. The secured original remains in your inbox.",
            false,
            "request_cancelled",
          );
        }
        processing.mark(local.id, "analysing", {
          secured: true,
          intakeId: intake.id,
        });
        analysed = await analyseIntake(
          intake.id,
          image,
          undefined,
          controller.signal,
        );
      }
      analysed = await finishReceiptAnalysis(
        analysed,
        local.id,
        processing,
        updateIntake,
        () => controller.signal.aborted,
      );
      await settle(local, analysed);
    } catch (caught) {
      const cancelled =
        requestControl.cancelled.has(local.id) ||
        (caught instanceof ReceiptApiError &&
          caught.code === "request_cancelled");
      if (cancelled) {
        await removeLocal(local.id);
        processing.remove([local.id]);
        setError(
          intake
            ? "Stopped waiting for AI. The secured original remains in your inbox."
            : "Upload cancelled before the original was secured.",
        );
        return;
      }
      if (
        caught instanceof ReceiptApiError &&
        caught.code === "receipt_duplicate"
      ) {
        await removeLocal(local.id);
        processing.mark(local.id, "duplicate", {
          secured: true,
          error: "This receipt has already been added.",
        });
        setError("This receipt has already been added.");
        return;
      }
      const message =
        caught instanceof Error ? caught.message : "Automatic reading failed.";
      const retryable =
        !navigator.onLine ||
        caught instanceof ReceiptRecoveryPendingError ||
        caught instanceof AutoConfirmationPendingError ||
        (caught instanceof ReceiptApiError && caught.retryable);
      current = await updateLocal(current, {
        stage: retryable && !navigator.onLine ? "waiting-online" : "failed",
        error: message,
        ...(intake ? { intakeId: intake.id } : {}),
      });
      processing.mark(
        local.id,
        !navigator.onLine
          ? "waiting"
          : caught instanceof ReceiptRecoveryPendingError ||
              caught instanceof AutoConfirmationPendingError
            ? "pending"
            : "failed",
        {
          secured: Boolean(intake),
          intakeId: intake?.id,
          error: message,
        },
      );
      if (intake) {
        setRetryableAnalysisIds((ids) => [...new Set([...ids, intake!.id])]);
      }
      setError(message);
    } finally {
      if (intake) {
        setProcessingIds((ids) => ids.filter((id) => id !== intake!.id));
      }
      finishReceiptRequest(requestControl, local.id);
    }
  };
}
