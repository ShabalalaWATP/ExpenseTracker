type ConcurrentDuplicate = { id: string } | null;

export type ReceiptIntakeFailureResponsibility =
  | "commit_reconciliation_pending"
  | "orphan_cleanup_pending";

type ReceiptIntakeCommitFailure<CommittedIntake> = {
  primaryError: unknown;
  reconcileCommittedIntake: () => Promise<CommittedIntake | null>;
  deleteOriginal: () => Promise<unknown>;
  findConcurrentDuplicate: () => Promise<ConcurrentDuplicate>;
  retainFailureResponsibility: (
    responsibility: ReceiptIntakeFailureResponsibility,
  ) => Promise<unknown>;
  concurrentDuplicateError: (id: string) => unknown;
};

export async function handleReceiptIntakeCommitFailure<CommittedIntake>({
  primaryError,
  reconcileCommittedIntake,
  deleteOriginal,
  findConcurrentDuplicate,
  retainFailureResponsibility,
  concurrentDuplicateError,
}: ReceiptIntakeCommitFailure<CommittedIntake>): Promise<CommittedIntake> {
  let committedIntake: CommittedIntake | null;
  try {
    committedIntake = await reconcileCommittedIntake();
  } catch {
    await retainFailureResponsibility(
      "commit_reconciliation_pending",
    ).catch(() => {});
    throw primaryError;
  }
  if (committedIntake !== null) {
    return committedIntake;
  }

  let cleanupFailed = false;
  try {
    await deleteOriginal();
  } catch {
    cleanupFailed = true;
  }
  if (cleanupFailed) {
    await retainFailureResponsibility("orphan_cleanup_pending").catch(
      () => {},
    );
  }

  const concurrentDuplicate = await findConcurrentDuplicate().catch(() => null);
  if (concurrentDuplicate) {
    throw concurrentDuplicateError(concurrentDuplicate.id);
  }
  throw primaryError;
}
