import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { pollAnalysingReceipt, receiptRecoveryAction } from "../app/components/receipt-intake/receipt-recovery.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { availableReceiptUploadSlots } from "../app/components/receipt-intake/upload-queue.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { receiptRetrySource } from "../app/components/receipt-intake/receipt-retry-source.ts";

describe("receipt recovery decisions", () => {
  it("does not repeat analysis for an authoritative server outcome", () => {
    assert.equal(receiptRecoveryAction(undefined), "upload");
    assert.equal(receiptRecoveryAction("uploaded"), "analyse");
    assert.equal(receiptRecoveryAction("analysing"), "poll");
    assert.equal(receiptRecoveryAction("ready"), "confirm");
    assert.equal(receiptRecoveryAction("needs_review"), "show");
    assert.equal(receiptRecoveryAction("failed"), "show");
    assert.equal(receiptRecoveryAction("confirmed"), "cleanup");
  });

  it("polls an analysing receipt until its server state settles", async () => {
    const statuses = ["analysing", "analysing", "ready"] as const;
    let calls = 0;
    const result = await pollAnalysingReceipt(
      "intake-1",
      async () => [
        {
          id: "intake-1",
          status: statuses[calls++] ?? "ready",
        },
      ] as never,
      { attempts: 5, delayMs: 0, wait: async () => {} },
    );

    assert.equal(result?.status, "ready");
    assert.equal(calls, 3);
  });

  it("globally bounds the local queue at twenty receipts", () => {
    assert.equal(availableReceiptUploadSlots(0), 20);
    assert.equal(availableReceiptUploadSlots(10), 10);
    assert.equal(availableReceiptUploadSlots(19), 1);
    assert.equal(availableReceiptUploadSlots(20), 0);
    assert.equal(availableReceiptUploadSlots(24), 0);
  });

  it("retries from secured evidence after releasing the local File", () => {
    assert.equal(
      receiptRetrySource({ hasAnalysisCopy: true }, false),
      "analysis-copy",
    );
    assert.equal(
      receiptRetrySource({ hasAnalysisCopy: false }, false),
      "original",
    );
    assert.equal(
      receiptRetrySource({ hasAnalysisCopy: true }, true),
      "local-file",
    );
  });
});
