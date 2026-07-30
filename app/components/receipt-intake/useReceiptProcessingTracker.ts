"use client";

import { useCallback, useMemo, useState } from "react";
import {
  beginProcessingBatch,
  dismissBlockedJobs,
  summariseReceiptProcessing,
  updateProcessingJob,
  type ReceiptProcessingJob,
  type ReceiptProcessingStage,
} from "./processing-state";

export function useReceiptProcessingTracker() {
  const [jobs, setJobs] = useState<ReceiptProcessingJob[]>([]);

  const begin = useCallback(function begin(
    files: readonly { id: string; name: string; waiting?: boolean }[],
  ) {
    setJobs((current) => beginProcessingBatch(current, files));
  }, []);

  const mark = useCallback(function mark(
    id: string,
    stage: ReceiptProcessingStage,
    changes: { secured?: boolean; error?: string } = {},
  ) {
    setJobs((current) =>
      updateProcessingJob(current, id, {
        stage,
        ...changes,
        ...(stage !== "failed" && stage !== "waiting"
          ? { error: undefined }
          : {}),
      }),
    );
  }, []);
  const dismissBlocked = useCallback(
    () => setJobs((current) => dismissBlockedJobs(current)),
    [],
  );

  return {
    begin,
    mark,
    dismissBlocked,
    summary: useMemo(() => summariseReceiptProcessing(jobs), [jobs]),
  };
}
