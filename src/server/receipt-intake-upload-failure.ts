import { recordAudit } from "./audit-repository";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import type { ReceiptIntakeRow } from "./receipt-intake-model";
import {
  handleReceiptIntakeCommitFailure,
  type ReceiptIntakeFailureResponsibility,
} from "./receipt-intake-commit-failure";

export function receiptIntakeCommitFailureHandler(input: {
  principal: Principal;
  database: D1Database;
  bucket: R2Bucket;
  objectKey: string;
  hash: string;
  intakeId: string;
}) {
  const {
    principal,
    database,
    bucket,
    objectKey,
    hash,
    intakeId,
  } = input;
  return (primaryError: unknown) =>
    handleReceiptIntakeCommitFailure({
      primaryError,
      reconcileCommittedIntake: () =>
        database
          .prepare(
            `SELECT * FROM receipt_intakes
             WHERE owner_id = ? AND id = ? AND sha256 = ?
               AND original_object_key = ?`,
          )
          .bind(principal.ownerId, intakeId, hash, objectKey)
          .first<ReceiptIntakeRow>(),
      deleteOriginal: () => bucket.delete(objectKey),
      findConcurrentDuplicate: () =>
        database
          .prepare(
            "SELECT id FROM receipt_intakes WHERE owner_id = ? AND sha256 = ? AND id <> ? AND discarded_at IS NULL",
          )
          .bind(principal.ownerId, hash, intakeId)
          .first<{ id: string }>(),
      retainFailureResponsibility: (
        responsibility: ReceiptIntakeFailureResponsibility,
      ) =>
        recordAudit(principal, {
          action: `receipt_intake.${responsibility}`,
          entityType: "receipt_intake",
          entityId: intakeId,
          metadata: { objectKey },
        }),
      concurrentDuplicateError: (existingId) =>
        new ApiError(
          409,
          "receipt_duplicate",
          "This receipt has already been added.",
          { existingId, existingKind: "intake" },
        ),
    });
}
