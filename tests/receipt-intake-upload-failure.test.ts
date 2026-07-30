import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { handleReceiptIntakeCommitFailure } from "../src/server/receipt-intake-commit-failure.ts";

test("an R2 cleanup failure cannot mask the original D1 error", async () => {
  const primaryError = new Error("d1 insert failed");
  const events: string[] = [];

  await assert.rejects(
    handleReceiptIntakeCommitFailure({
      primaryError,
      reconcileCommittedIntake: async () => null,
      deleteOriginal: async () => {
        events.push("delete");
        throw new Error("r2 unavailable");
      },
      retainFailureResponsibility: async (responsibility) => {
        events.push(`retain:${responsibility}`);
        throw new Error("audit unavailable");
      },
      findConcurrentDuplicate: async () => {
        events.push("duplicate-check");
        throw new Error("d1 unavailable");
      },
      concurrentDuplicateError: () => new Error("duplicate"),
    }),
    (error) => error === primaryError,
  );
  assert.deepEqual(events, [
    "delete",
    "retain:orphan_cleanup_pending",
    "duplicate-check",
  ]);
});

test("successful cleanup does not create an orphan-cleanup record", async () => {
  const primaryError = new Error("d1 insert failed");
  let retained = false;

  await assert.rejects(
    handleReceiptIntakeCommitFailure({
      primaryError,
      reconcileCommittedIntake: async () => null,
      deleteOriginal: async () => {},
      retainFailureResponsibility: async () => {
        retained = true;
      },
      findConcurrentDuplicate: async () => null,
      concurrentDuplicateError: () => new Error("duplicate"),
    }),
    (error) => error === primaryError,
  );
  assert.equal(retained, false);
});

test("a concurrent receipt remains a friendly exact-duplicate response", async () => {
  const primaryError = new Error("unique constraint");

  await assert.rejects(
    handleReceiptIntakeCommitFailure({
      primaryError,
      reconcileCommittedIntake: async () => null,
      deleteOriginal: async () => {
        throw new Error("r2 unavailable");
      },
      retainFailureResponsibility: async () => {},
      findConcurrentDuplicate: async () => ({ id: "existing-intake" }),
      concurrentDuplicateError: (id) =>
        Object.assign(new Error("This receipt has already been added."), {
          code: "receipt_duplicate",
          details: { existingId: id, existingKind: "intake" },
        }),
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "receipt_duplicate" &&
      "details" in error &&
      (error.details as { existingId?: string }).existingId ===
        "existing-intake",
  );
});

test("a committed intake survives a failed D1 batch acknowledgement", async () => {
  const committed = { id: "new-intake", sha256: "receipt-hash" };
  const events: string[] = [];

  const result = await handleReceiptIntakeCommitFailure({
    primaryError: new Error("D1 response failed after commit"),
    reconcileCommittedIntake: async () => {
      events.push("reconcile");
      return committed;
    },
    deleteOriginal: async () => {
      events.push("delete");
    },
    retainFailureResponsibility: async (responsibility) => {
      events.push(`retain:${responsibility}`);
    },
    findConcurrentDuplicate: async () => {
      events.push("duplicate-check");
      return null;
    },
    concurrentDuplicateError: () => new Error("duplicate"),
  });

  assert.equal(result, committed);
  assert.deepEqual(events, ["reconcile"]);
});

test("an unavailable reconciliation preserves the original object", async () => {
  const primaryError = new Error("D1 response failed after commit");
  const events: string[] = [];

  await assert.rejects(
    handleReceiptIntakeCommitFailure({
      primaryError,
      reconcileCommittedIntake: async () => {
        events.push("reconcile");
        throw new Error("D1 unavailable");
      },
      deleteOriginal: async () => {
        events.push("delete");
      },
      retainFailureResponsibility: async (responsibility) => {
        events.push(`retain:${responsibility}`);
      },
      findConcurrentDuplicate: async () => {
        events.push("duplicate-check");
        return null;
      },
      concurrentDuplicateError: () => new Error("duplicate"),
    }),
    (error) => error === primaryError,
  );

  assert.deepEqual(events, [
    "reconcile",
    "retain:commit_reconciliation_pending",
  ]);
});

test("an ambiguous original-object put enters the same cleanup path", async () => {
  const [source, failureHandler] = await Promise.all([
    readFile(
      new URL("../src/server/receipt-intake-repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/server/receipt-intake-upload-failure.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    source,
    /try \{\s+await bucket\.put\([\s\S]+?\}\s+catch \(error\) \{\s+const committed = await handleCommitFailure\(error\);/,
  );
  assert.match(
    failureHandler,
    /SELECT \* FROM receipt_intakes[\s\S]+owner_id = \? AND id = \? AND sha256 = \?[\s\S]+original_object_key = \?/,
  );
});
