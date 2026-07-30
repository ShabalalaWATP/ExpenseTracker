import type { Dispatch, SetStateAction } from "react";
import { canSelectReceipt } from "./image";
import type { BatchDefaults, LocalUpload } from "./types";
import { saveUploadDraft } from "./upload-drafts";
import { MAX_UPLOAD_BATCH, uploadIdentifier } from "./upload-queue";
import type { useReceiptProcessingTracker } from "./useReceiptProcessingTracker";

type ProcessingTracker = ReturnType<typeof useReceiptProcessingTracker>;

export async function enqueueReceiptFiles({
  selected,
  defaults,
  processing,
  setError,
  setLocalUploads,
  processFile,
  isCancelled,
}: {
  selected: File[];
  defaults: BatchDefaults;
  processing: ProcessingTracker;
  setError: Dispatch<SetStateAction<string>>;
  setLocalUploads: Dispatch<SetStateAction<LocalUpload[]>>;
  processFile: (item: LocalUpload) => Promise<void>;
  isCancelled: (id: string) => boolean;
}): Promise<void> {
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
        if (!isCancelled(item.id)) await processFile(item);
        item = work.shift();
      }
    }),
  );
}
