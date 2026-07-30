"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getAiStatus, listIntakes } from "./receiptApi";
import type { AiStatus, LocalUpload, ReceiptIntake } from "./types";
import { listUploadDrafts } from "./upload-drafts";

export function useInitialReceiptInbox({
  initialIntakeId,
  beginProcessing,
  processRef,
  setAi,
  setError,
  setIntakes,
  setSelectedId,
  setLocalUploads,
  setLoading,
}: {
  initialIntakeId?: string;
  beginProcessing: (
    files: readonly { id: string; name: string; waiting?: boolean }[],
  ) => void;
  processRef: MutableRefObject<(item: LocalUpload) => Promise<void>>;
  setAi: Dispatch<SetStateAction<AiStatus | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setIntakes: Dispatch<SetStateAction<ReceiptIntake[]>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setLocalUploads: Dispatch<SetStateAction<LocalUpload[]>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}) {
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
  }, [
    beginProcessing,
    initialIntakeId,
    processRef,
    setAi,
    setError,
    setIntakes,
    setLoading,
    setLocalUploads,
    setSelectedId,
  ]);
}
