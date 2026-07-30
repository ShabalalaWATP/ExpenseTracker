import { getReceiptsBucket } from "@/db";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import { assertDateUnlocked } from "./claim-locks";
import type { Principal } from "./principal";
import { auditStatement } from "./audit-repository";
import { selectExpenseReceiptSource } from "@/src/domain/receipt-evidence";
import { directReceiptPreviewObjectKey } from "@/src/domain/receipt-evidence";
import { validateImageType } from "./receipt-image-validation";
import { loadVerifiedReceiptPreview } from "./receipt-preview";

export { validateImageType } from "./receipt-image-validation";

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

type ExpenseReceiptRecord = ReceiptRecord & {
  analysis_object_key: string | null;
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

export async function expenseReceiptObject(
  principal: Principal,
  expenseId: string,
  download: boolean,
) {
  await ensureSchema();
  const row = await database()
    .prepare(
      `SELECT r.*, i.analysis_object_key
       FROM receipts r
       LEFT JOIN receipt_intakes i
         ON i.owner_id = r.owner_id
        AND i.expense_id = r.expense_id
        AND i.status = 'confirmed'
       WHERE r.owner_id = ? AND r.expense_id = ?
       LIMIT 1`,
    )
    .bind(principal.ownerId, expenseId)
    .first<ExpenseReceiptRecord>();
  if (!row) {
    throw new ApiError(404, "not_found", "The receipt was not found.");
  }

  const bucket = getReceiptsBucket();
  const selected = selectExpenseReceiptSource(
    {
      objectKey: row.object_key,
      contentType: row.content_type,
      analysisObjectKey:
        row.analysis_object_key ??
        (row.content_type === "image/heic" || row.content_type === "image/heif"
          ? directReceiptPreviewObjectKey(principal.ownerId, row.id)
          : null),
    },
    download,
  );
  if (!selected.original) {
    const preview = await loadVerifiedReceiptPreview(
      principal.ownerId,
      selected.objectKey,
      selected.contentType as "image/jpeg" | "image/png",
    );
    if (preview) {
      return { ...preview, original: false };
    }
  }
  const source = selected.original
    ? selected
    : {
      objectKey: row.object_key,
      contentType: row.content_type,
      original: true,
    };
  const object = await bucket.get(source.objectKey);
  if (!object) {
    throw new ApiError(404, "not_found", "The receipt was not found.");
  }
  return {
    body: object.body,
    contentType: source.contentType,
    byteSize: source.original ? row.byte_size : object.size,
    original: source.original,
  };
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
