import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import * as processing from "../app/components/receipt-intake/processing-state.ts";

const {
  beginProcessingBatch,
  dismissBlockedJobs,
  removeProcessingJobs,
  summariseReceiptProcessing,
  updateProcessingJob,
} = processing;

describe("receipt batch processing state", () => {
  it("tracks batch progress without counting analysis as another receipt", () => {
    let jobs = beginProcessingBatch([], [
      { id: "a", name: "one.jpg" },
      { id: "b", name: "two.jpg" },
    ]);
    jobs = updateProcessingJob(jobs, "a", {
      stage: "analysing",
      secured: true,
    });
    jobs = updateProcessingJob(jobs, "b", {
      stage: "uploading",
    });

    const summary = summariseReceiptProcessing(jobs);
    assert.equal(summary.total, 2);
    assert.equal(summary.running, 2);
    assert.equal(summary.secured, 1);
    assert.equal(summary.completed, 0);
    assert.equal(summary.stage, "uploading");
  });

  it("keeps truthful finished and secured counts after one item completes", () => {
    let jobs = beginProcessingBatch([], [
      { id: "a", name: "one.jpg" },
      { id: "b", name: "two.jpg" },
    ]);
    jobs = updateProcessingJob(jobs, "a", {
      stage: "completed",
      secured: true,
    });
    jobs = updateProcessingJob(jobs, "b", {
      stage: "analysing",
      secured: true,
    });

    const summary = summariseReceiptProcessing(jobs);
    assert.equal(summary.total, 2);
    assert.equal(summary.completed, 1);
    assert.equal(summary.secured, 2);
    assert.equal(summary.stage, "analysing");
    assert.equal(summary.visible, true);
  });

  it("exposes blocked work for retry and lets the overlay return to the inbox", () => {
    let jobs = beginProcessingBatch([], [
      { id: "a", name: "offline.jpg", waiting: true },
    ]);
    let summary = summariseReceiptProcessing(jobs);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.stage, "waiting");
    assert.equal(summary.visible, true);

    jobs = updateProcessingJob(jobs, "a", { stage: "uploading" });
    summary = summariseReceiptProcessing(jobs);
    assert.equal(summary.blocked, 0);
    assert.equal(summary.running, 1);

    jobs = updateProcessingJob(jobs, "a", {
      stage: "pending",
      error: "Still processing",
    });
    assert.equal(summariseReceiptProcessing(jobs).stage, "pending");
    assert.deepEqual(dismissBlockedJobs(jobs), []);
  });

  it("removes cancelled jobs without affecting the rest of the batch", () => {
    const jobs = beginProcessingBatch([], [
      { id: "a", name: "cancel.jpg" },
      { id: "b", name: "keep.jpg" },
    ]);
    assert.deepEqual(
      removeProcessingJobs(jobs, new Set(["a"])).map((job) => job.id),
      ["b"],
    );
  });
});
