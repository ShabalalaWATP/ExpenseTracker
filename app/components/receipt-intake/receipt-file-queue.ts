import type { Dispatch, SetStateAction } from "react";
import { canSelectReceipt } from "./image";
import type { BatchDefaults, LocalUpload } from "./types";
import { removeUploadDraft, saveUploadDraft } from "./upload-drafts";
import { MAX_UPLOAD_BATCH, uploadIdentifier } from "./upload-queue";
import type { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";

type ProcessingTracker = ReturnType<typeof useReceiptProcessingTracker>;

export async function enqueueReceiptFiles({
  selected,
  defaults,
  processing,
  setError,
  setLocalUploads,
  scheduleFile,
  isCancelled,
  availableSlots,
}: {
  selected: File[];
  defaults: BatchDefaults;
  processing: ProcessingTracker;
  setError: Dispatch<SetStateAction<string>>;
  setLocalUploads: Dispatch<SetStateAction<LocalUpload[]>>;
  scheduleFile: (item: LocalUpload) => Promise<void>;
  isCancelled: (id: string) => boolean;
  availableSlots: number;
}): Promise<void> {
  setError("");
  const supported = selected.filter(canSelectReceipt);
  const candidates = supported.slice(
    0,
    Math.min(MAX_UPLOAD_BATCH, availableSlots),
  );
  if (supported.length !== selected.length) {
    setError("Some files were skipped. Choose receipt images up to 20 MB.");
  }
  if (supported.length > candidates.length) {
    setError(
      availableSlots === 0
        ? `The queue already contains ${MAX_UPLOAD_BATCH} receipts. Let some finish before adding more.`
        : `Only ${candidates.length} more photo${candidates.length === 1 ? "" : "s"} could be added because the queue holds ${MAX_UPLOAD_BATCH}.`,
    );
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
  setLocalUploads((items) => [...queued, ...items]);
  const scheduled: Promise<void>[] = [];
  for (const item of queued) {
    try {
      await saveUploadDraft(item);
    } catch {
      setError(
        "Safari could not preserve one photo for recovery. Its upload is starting now, but keep this page open until it is secured.",
      );
    }
    if (isCancelled(item.id)) {
      await removeUploadDraft(item.id).catch(() => {});
      continue;
    }
    scheduled.push(scheduleFile(item));
  }
  await Promise.all(scheduled);
}
