import { getReceiptsBucket } from "@/db";
import { auditStatement } from "./audit-repository";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import {
  publicIntake,
  unresolvedFields,
  type ReceiptIntakeRow,
} from "./receipt-intake-model";
import type {
  IntakeDefaults,
  IntakePatch,
} from "./receipt-intake-validation";
import {
  MAX_RECEIPT_BYTES,
  validateImageType,
} from "./receipt-repository";
import {
  intakeImageExtension,
  receiptSha256,
  validIntakeIdempotencyKey,
} from "./receipt-intake-storage";

function stringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

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
       WHERE owner_id = ?
       ORDER BY updated_at DESC
       LIMIT 100`,
    )
    .bind(principal.ownerId)
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
  const prior = await db
    .prepare(
      "SELECT * FROM receipt_intakes WHERE owner_id = ? AND idempotency_key = ?",
    )
    .bind(principal.ownerId, idempotencyKey)
    .first<ReceiptIntakeRow>();
  if (prior) return { intake: publicIntake(prior), created: false };

  const hash = await receiptSha256(bytes);
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
    );
  }

  const id = crypto.randomUUID();
  const objectKey =
    `receipt-intakes/${id}/original.${intakeImageExtension(contentType)}`;
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
            idempotency_key, location, business_reason, trip_id, meal_context,
            missing_fields_json
          ) VALUES (?, ?, ?, 'uploaded', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          defaults.location,
          defaults.businessReason,
          defaults.tripId,
          defaults.mealContext,
          JSON.stringify([
            "merchant",
            "service_date",
            "receipt_total",
            "eligible_amount",
            ...(defaults.location ? [] : ["location"]),
            ...(defaults.businessReason ? [] : ["business_reason"]),
          ]),
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

const patchColumns: Record<keyof IntakePatch, string> = {
  merchant: "merchant",
  serviceDate: "service_date",
  receiptTotalPence: "receipt_total_pence",
  eligiblePence: "eligible_pence",
  gratuityPence: "gratuity_pence",
  location: "location",
  businessReason: "business_reason",
  mealContext: "meal_context",
  tripId: "trip_id",
  alcoholReviewed: "alcohol_reviewed",
};

const fieldForPatch: Partial<Record<keyof IntakePatch, string>> = {
  merchant: "merchant",
  serviceDate: "service_date",
  receiptTotalPence: "receipt_total",
  eligiblePence: "eligible_amount",
  location: "location",
  businessReason: "business_reason",
  alcoholReviewed: "alcohol",
};

export async function updateReceiptIntake(
  principal: Principal,
  id: string,
  patch: IntakePatch,
) {
  const existing = await requireIntake(principal, id);
  if (existing.status === "confirmed") {
    throw new ApiError(409, "receipt_confirmed", "This receipt is already confirmed.");
  }
  if (existing.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before editing it.",
    );
  }
  await requireOwnedTrip(principal, patch.tripId ?? existing.trip_id);
  const receiptTotal =
    patch.receiptTotalPence ?? existing.receipt_total_pence;
  const eligible = patch.eligiblePence ?? existing.eligible_pence;
  const gratuity = patch.gratuityPence ?? existing.gratuity_pence;
  if (
    receiptTotal !== null &&
    eligible !== null &&
    (eligible > receiptTotal || gratuity > eligible)
  ) {
    throw new ApiError(
      400,
      "validation_failed",
      "Eligible amount and gratuity must fit within the receipt total.",
    );
  }
  const cleared = new Set(
    (Object.keys(patch) as (keyof IntakePatch)[])
      .map((key) => fieldForPatch[key])
      .filter((field): field is string => Boolean(field)),
  );
  const missing = stringArray(existing.missing_fields_json).filter(
    (field) => !cleared.has(field),
  );
  const uncertain = stringArray(existing.uncertain_fields_json).filter(
    (field) => !cleared.has(field),
  );
  const entries = Object.entries(patch) as [keyof IntakePatch, unknown][];
  const assignments = entries.map(([key]) => `${patchColumns[key]} = ?`);
  const values = entries.map(([key, value]) =>
    key === "alcoholReviewed" ? Number(value) : value,
  );
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET ${assignments.join(", ")},
           missing_fields_json = ?,
           uncertain_fields_json = ?,
           error_code = NULL,
           error_message = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ?`,
    )
    .bind(
      ...values,
      JSON.stringify(missing),
      JSON.stringify(uncertain),
      principal.ownerId,
      id,
    )
    .run();
  const updated = await requireIntake(principal, id);
  const status = unresolvedFields(updated).length ? "needs_review" : "ready";
  await database()
    .prepare(
      `UPDATE receipt_intakes SET status = ? WHERE owner_id = ? AND id = ?`,
    )
    .bind(status, principal.ownerId, id)
    .run();
  await auditStatement(principal, {
    action: "receipt_intake.reviewed",
    entityType: "receipt_intake",
    entityId: id,
    metadata: { fieldsChanged: entries.length },
  }).run();
  return publicIntake(await requireIntake(principal, id));
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
  const bucket = getReceiptsBucket();
  await Promise.all([
    bucket.delete(row.original_object_key),
    row.analysis_object_key
      ? bucket.delete(row.analysis_object_key)
      : Promise.resolve(),
  ]);
  await database().batch([
    database()
      .prepare("DELETE FROM receipt_intakes WHERE owner_id = ? AND id = ?")
      .bind(principal.ownerId, id),
    auditStatement(principal, {
      action: "receipt_intake.deleted",
      entityType: "receipt_intake",
      entityId: id,
    }),
  ]);
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
