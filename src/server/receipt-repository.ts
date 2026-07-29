import { getReceiptsBucket } from "@/db";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import { assertDateUnlocked } from "./claim-locks";
import type { Principal } from "./principal";
import { auditStatement } from "./audit-repository";

export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;

type ReceiptRecord = {
  id: string;
  owner_id: string;
  expense_id: string;
  object_key: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  idempotency_key: string;
  created_at: string;
};

export function publicReceipt(row: ReceiptRecord) {
  return {
    id: row.id,
    contentType: row.content_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    url: `/api/receipts/${row.id}`,
  };
}

function bytesEqual(value: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => value[index] === byte);
}

export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytesEqual(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytesEqual(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp") {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return brand === "mif1" || brand === "msf1" ? "image/heif" : "image/heic";
    }
  }
  return null;
}

export function validateImageType(bytes: Uint8Array, declared: string | null): string {
  const cleanDeclared = declared?.split(";")[0].trim().toLowerCase() ?? "";
  const detected = detectImageType(bytes);
  const heifTypes = new Set(["image/heic", "image/heif"]);
  const compatible =
    detected === cleanDeclared ||
    (detected !== null &&
      (cleanDeclared === "" || cleanDeclared === "application/octet-stream")) ||
    (detected !== null &&
      heifTypes.has(detected) &&
      heifTypes.has(cleanDeclared));
  if (!compatible) {
    throw new ApiError(
      415,
      "receipt_type_invalid",
      "Upload a JPEG, PNG, HEIC or HEIF receipt image.",
    );
  }
  return detected!;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function attachReceipt(
  principal: Principal,
  expenseId: string,
  bytes: Uint8Array,
  declaredType: string | null,
  idempotencyKey: string | null,
) {
  await ensureSchema();
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[\x21-\x7e]+$/.test(idempotencyKey)
  ) {
    throw new ApiError(
      400,
      "idempotency_key_invalid",
      "Provide an Idempotency-Key of 8 to 128 characters.",
    );
  }
  if (bytes.length === 0 || bytes.length > MAX_RECEIPT_BYTES) {
    throw new ApiError(413, "receipt_too_large", "Receipt images must be 20 MB or smaller.");
  }
  const contentType = validateImageType(bytes, declaredType);
  const db = database();
  const prior = await db
    .prepare(
      "SELECT * FROM receipts WHERE owner_id = ? AND idempotency_key = ?",
    )
    .bind(principal.ownerId, idempotencyKey)
    .first<ReceiptRecord>();
  if (prior) {
    if (prior.expense_id !== expenseId) {
      throw new ApiError(409, "idempotency_conflict", "That upload key has already been used.");
    }
    return { receipt: publicReceipt(prior), created: false };
  }
  const expense = await db
    .prepare(
      `SELECT id, service_date, deleted_at
       FROM expenses WHERE owner_id = ? AND id = ?`,
    )
    .bind(principal.ownerId, expenseId)
    .first<{ id: string; service_date: string; deleted_at: string | null }>();
  if (!expense) {
    throw new ApiError(404, "not_found", "The expense was not found.");
  }
  if (expense.deleted_at) {
    throw new ApiError(
      409,
      "expense_deleted",
      "Restore this expense before attaching a receipt.",
    );
  }
  await assertDateUnlocked(principal.ownerId, expense.service_date);
  const existing = await db
    .prepare(
      "SELECT id FROM receipts WHERE owner_id = ? AND expense_id = ?",
    )
    .bind(principal.ownerId, expenseId)
    .first<{ id: string }>();
  if (existing) {
    throw new ApiError(409, "receipt_exists", "This expense already has a receipt.");
  }
  const hash = await sha256(bytes);
  const duplicate = await db
    .prepare("SELECT id FROM receipts WHERE owner_id = ? AND sha256 = ?")
    .bind(principal.ownerId, hash)
    .first<{ id: string }>();
  if (duplicate) {
    throw new ApiError(409, "receipt_duplicate", "This receipt image has already been uploaded.");
  }
  const id = crypto.randomUUID();
  const extension =
    contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "heic";
  const objectKey = `receipts/${principal.ownerId}/${crypto.randomUUID()}.${extension}`;
  const bucket = getReceiptsBucket();
  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: { sha256: hash },
  });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO receipts (
            id, owner_id, expense_id, object_key, content_type, byte_size,
            sha256, idempotency_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          principal.ownerId,
          expenseId,
          objectKey,
          contentType,
          bytes.length,
          hash,
          idempotencyKey,
        ),
      auditStatement(principal, {
        action: "receipt.attached",
        entityType: "receipt",
        entityId: id,
      }),
    ]);
  } catch (error) {
    await bucket.delete(objectKey);
    throw error;
  }
  const row = await db
    .prepare("SELECT * FROM receipts WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, id)
    .first<ReceiptRecord>();
  return { receipt: publicReceipt(row!), created: true };
}

export async function receiptObject(principal: Principal, id: string) {
  await ensureSchema();
  const row = await database()
    .prepare("SELECT * FROM receipts WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, id)
    .first<ReceiptRecord>();
  if (!row) {
    throw new ApiError(404, "not_found", "The receipt was not found.");
  }
  const object = await getReceiptsBucket().get(row.object_key);
  if (!object) {
    throw new ApiError(404, "not_found", "The receipt was not found.");
  }
  return { row, object };
}

export async function removeReceiptObjects(
  objectKeys: readonly string[],
): Promise<void> {
  await Promise.all(
    [...new Set(objectKeys)].map((objectKey) =>
      getReceiptsBucket().delete(objectKey),
    ),
  );
}
