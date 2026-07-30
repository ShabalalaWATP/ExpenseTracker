export type ReceiptProcessingStage =
  | "queued"
  | "waiting"
  | "uploading"
  | "preparing"
  | "analysing"
  | "validating"
  | "confirming"
  | "pending"
  | "completed"
  | "failed";

export type ReceiptProcessingJob = {
  id: string;
  name: string;
  stage: ReceiptProcessingStage;
  secured: boolean;
  error?: string;
};

export type ReceiptProcessingSummary = {
  jobs: ReceiptProcessingJob[];
  total: number;
  completed: number;
  secured: number;
  running: number;
  blocked: number;
  currentName: string;
  stage: Exclude<ReceiptProcessingStage, "completed" | "failed"> | "failed";
  visible: boolean;
};

export function beginProcessingBatch(
  current: readonly ReceiptProcessingJob[],
  files: readonly { id: string; name: string; waiting?: boolean }[],
): ReceiptProcessingJob[] {
  const unfinished = current.some(
    (job) => job.stage !== "completed" && job.stage !== "failed",
  );
  const base = unfinished ? [...current] : [];
  const known = new Set(base.map((job) => job.id));
  return [
    ...base,
    ...files
      .filter((file) => !known.has(file.id))
      .map((file) => ({
        id: file.id,
        name: file.name,
        stage: file.waiting ? ("waiting" as const) : ("queued" as const),
        secured: false,
      })),
  ];
}

export function updateProcessingJob(
  jobs: readonly ReceiptProcessingJob[],
  id: string,
  changes: Partial<Omit<ReceiptProcessingJob, "id">>,
): ReceiptProcessingJob[] {
  return jobs.map((job) => (job.id === id ? { ...job, ...changes } : job));
}

export function dismissBlockedJobs(
  jobs: readonly ReceiptProcessingJob[],
): ReceiptProcessingJob[] {
  return jobs.filter(
    (job) =>
      job.stage !== "failed" &&
      job.stage !== "waiting" &&
      job.stage !== "pending",
  );
}

const STAGE_PRIORITY: ReceiptProcessingStage[] = [
  "uploading",
  "queued",
  "preparing",
  "analysing",
  "validating",
  "confirming",
  "pending",
  "waiting",
  "failed",
  "completed",
];

export function summariseReceiptProcessing(
  jobs: readonly ReceiptProcessingJob[],
): ReceiptProcessingSummary {
  const completed = jobs.filter((job) => job.stage === "completed").length;
  const secured = jobs.filter((job) => job.secured).length;
  const blocked = jobs.filter(
    (job) =>
      job.stage === "waiting" ||
      job.stage === "pending" ||
      job.stage === "failed",
  ).length;
  const running = jobs.length - completed - blocked;
  const current =
    STAGE_PRIORITY.flatMap((stage) =>
      jobs.filter((job) => job.stage === stage),
    )[0] ?? null;
  return {
    jobs: [...jobs],
    total: jobs.length,
    completed,
    secured,
    running,
    blocked,
    currentName: current?.name ?? "",
    stage:
      current?.stage === "completed" || !current
        ? "queued"
        : current.stage,
    visible: running > 0 || blocked > 0,
  };
}
