import { getReceiptsBucket } from "@/db";
import {
  auditStatement,
  auditStatementAfterChange,
} from "./audit-repository";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import {
  publicIntake,
  type ReceiptIntakeRow,
} from "./receipt-intake-model";
import type { IntakeDefaults } from "./receipt-intake-validation";
import {
  MAX_RECEIPT_BYTES,
  validateImageType,
} from "./receipt-repository";
import {
  intakeImageExtension,
  receiptSha256,
  validIntakeIdempotencyKey,
} from "./receipt-intake-storage";
import { deleteReceiptIntakeAfterRecord } from "./receipt-intake-deletion";

async function requireOwnedTrip(
  principal: Principal,
  tripId: string | null,
): Promise<void> {
  if (!tripId) return;
  const trip = await database()
    .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, tripId)
    .first<{ id: string }>();
  if (!trip) {
    throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
  }
}

export async function requireIntake(
  principal: Principal,
  id: string,
): Promise<ReceiptIntakeRow> {
  await ensureSchema();
  const row = await database()
    .prepare("SELECT * FROM receipt_intakes WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, id)
    .first<ReceiptIntakeRow>();
  if (!row) {
    throw new ApiError(404, "not_found", "The receipt was not found.");
  }
  return row;
}

export async function listReceiptIntakes(principal: Principal) {
  await ensureSchema();
  const result = await database()
    .prepare(
      `SELECT * FROM receipt_intakes
       WHERE owner_id = ? AND status <> 'confirmed'
       ORDER BY updated_at DESC
       LIMIT 100`,
    )
    .bind(principal.ownerId)
    .all<ReceiptIntakeRow>();
  return result.results.map(publicIntake);
}

export async function listClaimBlockingReceiptIntakes(
  principal: Principal,
  period: string,
) {
  await ensureSchema();
  const result = await database()
    .prepare(
      `SELECT * FROM receipt_intakes
       WHERE owner_id = ?
         AND status <> 'confirmed'
         AND (service_date IS NULL OR service_date LIKE ?)
       ORDER BY updated_at DESC`,
    )
    .bind(principal.ownerId, `${period}-%`)
    .all<ReceiptIntakeRow>();
  return result.results.map(publicIntake);
}

export async function createReceiptIntake(
  principal: Principal,
  defaults: IntakeDefaults,
  bytes: Uint8Array,
  declaredType: string | null,
  idempotencyValue: string | null,
) {
  await ensureSchema();
  if (bytes.length === 0 || bytes.length > MAX_RECEIPT_BYTES) {
    throw new ApiError(
      413,
      "receipt_too_large",
      "Receipt images must be 20 MB or smaller.",
    );
  }
  const idempotencyKey = validIntakeIdempotencyKey(idempotencyValue);
  const contentType = validateImageType(bytes, declaredType);
  await requireOwnedTrip(principal, defaults.tripId);
  const db = database();
  const hash = await receiptSha256(bytes);
  const prior = await db
    .prepare(
      "SELECT * FROM receipt_intakes WHERE owner_id = ? AND idempotency_key = ?",
    )
    .bind(principal.ownerId, idempotencyKey)
    .first<ReceiptIntakeRow>();
  if (prior) {
    if (prior.sha256 !== hash) {
      throw new ApiError(
        409,
        "idempotency_conflict",
        "This retry key belongs to a different receipt photo.",
      );
    }
    return { intake: publicIntake(prior), created: false };
  }

  const duplicateIntake = await db
    .prepare(
      "SELECT id FROM receipt_intakes WHERE owner_id = ? AND sha256 = ?",
    )
    .bind(principal.ownerId, hash)
    .first<{ id: string }>();
  const duplicateReceipt = await db
    .prepare("SELECT id FROM receipts WHERE owner_id = ? AND sha256 = ?")
    .bind(principal.ownerId, hash)
    .first<{ id: string }>();
  if (duplicateIntake || duplicateReceipt) {
    throw new ApiError(
      409,
      "receipt_duplicate",
      "This receipt image has already been uploaded.",
      {
        existingId: duplicateIntake?.id ?? duplicateReceipt?.id,
        existingKind: duplicateIntake ? "intake" : "expense",
      },
    );
  }

  const id = crypto.randomUUID();
  const objectKey =
    `receipt-intakes/${principal.ownerId}/${id}/original.${intakeImageExtension(contentType)}`;
  const bucket = getReceiptsBucket();
  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: { sha256: hash },
  });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO receipt_intakes (
            id, owner_id, batch_id, status, original_name,
            original_object_key, content_type, byte_size, sha256,
            idempotency_key, service_date, location, business_reason, trip_id, meal_context,
            missing_fields_json, correction_provenance_json
          ) VALUES (?, ?, ?, 'uploaded', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          principal.ownerId,
          defaults.batchId,
          defaults.originalName,
          objectKey,
          contentType,
          bytes.length,
          hash,
          idempotencyKey,
          defaults.serviceDate,
          defaults.location,
          defaults.businessReason,
          defaults.tripId,
          defaults.mealContext,
          JSON.stringify([
            "merchant",
            ...(defaults.serviceDate ? [] : ["service_date"]),
            "receipt_total",
            "eligible_amount",
            ...(defaults.location ? [] : ["location"]),
            ...(defaults.businessReason ? [] : ["business_reason"]),
          ]),
          JSON.stringify({
            ...(defaults.serviceDate ? { service_date: "owner" } : {}),
            ...(defaults.location ? { location: "owner" } : {}),
            ...(defaults.businessReason ? { business_reason: "owner" } : {}),
            ...(defaults.tripId ? { trip_id: "owner" } : {}),
            ...(defaults.mealContext ? { meal_context: "owner" } : {}),
          }),
        ),
      auditStatement(principal, {
        action: "receipt_intake.uploaded",
        entityType: "receipt_intake",
        entityId: id,
        metadata: { byteSize: bytes.length, contentType },
      }),
    ]);
  } catch (error) {
    await bucket.delete(objectKey);
    throw error;
  }
  return {
    intake: publicIntake(await requireIntake(principal, id)),
    created: true,
  };
}

export async function deleteReceiptIntake(
  principal: Principal,
  id: string,
): Promise<void> {
  const row = await requireIntake(principal, id);
  if (row.status === "confirmed") {
    throw new ApiError(
      409,
      "receipt_confirmed",
      "Delete the linked expense instead of its confirmed evidence.",
    );
  }
  if (row.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before removing it.",
    );
  }
  await deleteReceiptIntakeAfterRecord(
    {
      originalObjectKey: row.original_object_key,
      analysisObjectKey: row.analysis_object_key,
    },
    async () => {
      const results = await database().batch<{ id: string }>([
        database()
          .prepare(
            `DELETE FROM receipt_intakes
             WHERE owner_id = ? AND id = ?
               AND status NOT IN ('analysing', 'confirmed')
               AND expense_id IS NULL
               AND updated_at = ?
             RETURNING id`,
          )
          .bind(principal.ownerId, id, row.updated_at),
        auditStatementAfterChange(principal, {
          action: "receipt_intake.deleted",
          entityType: "receipt_intake",
          entityId: id,
        }),
      ]);
      const deleted = results[0]?.results ?? [];
      if (deleted.length !== 1 || deleted[0]?.id !== id) {
        throw new ApiError(
          409,
          "receipt_changed",
          "The receipt changed while it was being removed. Review it and try again.",
        );
      }
    },
    getReceiptsBucket(),
  );
}

export async function receiptIntakeObject(
  principal: Principal,
  id: string,
) {
  const row = await requireIntake(principal, id);
  const object = await getReceiptsBucket().get(row.original_object_key);
  if (!object) {
    throw new ApiError(404, "receipt_missing", "The receipt image is unavailable.");
  }
  return { row, object };
}
