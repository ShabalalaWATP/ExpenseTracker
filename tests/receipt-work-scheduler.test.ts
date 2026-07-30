import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { ReceiptWorkScheduler } from "../app/components/receipt-intake/receipt-work-scheduler.ts";

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("receipt work scheduler", () => {
  it("bounds ten fresh, restored and retried receipts to two workers", async () => {
    const scheduler = new ReceiptWorkScheduler(2);
    const gates = Array.from({ length: 10 }, deferred);
    const keys = [
      "fresh-1",
      "fresh-2",
      "fresh-3",
      "fresh-4",
      "restored-1",
      "restored-2",
      "restored-pending",
      "retry-1",
      "retry-2",
      "retry-3",
    ];
    let running = 0;
    let maximum = 0;
    const work = gates.map((gate, index) =>
      scheduler.schedule(keys[index], async () => {
        running += 1;
        maximum = Math.max(maximum, running);
        await gate.promise;
        running -= 1;
      }),
    );

    await Promise.resolve();
    assert.deepEqual(scheduler.snapshot(), {
      queued: 8,
      running: 2,
      total: 10,
    });
    for (const gate of gates) {
      gate.release();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(work);
    assert.equal(maximum, 2);
    assert.deepEqual(scheduler.snapshot(), {
      queued: 0,
      running: 0,
      total: 0,
    });
  });

  it("can serialise high-resolution image preparation", async () => {
    const scheduler = new ReceiptWorkScheduler(1);
    const gates = Array.from({ length: 3 }, deferred);
    let running = 0;
    let maximum = 0;
    const work = gates.map((gate, index) =>
      scheduler.schedule(`image-${index}`, async () => {
        running += 1;
        maximum = Math.max(maximum, running);
        await gate.promise;
        running -= 1;
      }),
    );

    for (const gate of gates) {
      gate.release();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(work);
    assert.equal(maximum, 1);
  });

  it("deduplicates repeated resume and retry requests for the same receipt", async () => {
    const scheduler = new ReceiptWorkScheduler(2);
    const gate = deferred();
    let calls = 0;
    const first = scheduler.schedule("same", async () => {
      calls += 1;
      await gate.promise;
    });
    const second = scheduler.schedule("same", async () => {
      calls += 1;
    });

    assert.equal(first, second);
    gate.release();
    await Promise.all([first, second]);
    assert.equal(calls, 1);
  });

  it("can cancel queued work without interrupting active work", async () => {
    const scheduler = new ReceiptWorkScheduler(1);
    const gate = deferred();
    let cancelledRan = false;
    const active = scheduler.schedule("active", () => gate.promise);
    const cancelled = scheduler.schedule("cancelled", async () => {
      cancelledRan = true;
    });

    assert.equal(scheduler.cancelPending("cancelled"), true);
    await cancelled;
    gate.release();
    await active;
    assert.equal(cancelledRan, false);
  });
});
