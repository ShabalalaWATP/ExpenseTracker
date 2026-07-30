import { getReceiptsBucket } from "@/db";
import { directReceiptPreviewObjectKey } from "@/src/domain/receipt-evidence";
import { sha256Hex, streamBytes } from "./binary";
import { assertDateUnlocked } from "./claim-locks";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import {
  detectImageType,
  imageDimensions,
  validateImageType,
} from "./receipt-image-validation";

export const MAX_RECEIPT_PREVIEW_BYTES = 10 * 1024 * 1024;

type PreviewReceiptRow = {
  id: string;
  content_type: string;
  service_date: string;
  sha256: string;
};

function keyBelongsToOwner(key: string, ownerId: string): boolean {
  return (
    key.startsWith(`receipt-previews/${ownerId}/`) ||
    key.startsWith(`receipt-intakes/${ownerId}/`)
  );
}

export async function storeExpenseReceiptPreview(
  principal: Principal,
  expenseId: string,
  bytes: Uint8Array,
  declaredType: string | null,
) {
  await ensureSchema();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RECEIPT_PREVIEW_BYTES) {
    throw new ApiError(
      413,
      "receipt_preview_too_large",
      "The receipt preview must be 10 MB or smaller.",
    );
  }
  const contentType = validateImageType(bytes, declaredType);
  if (contentType !== "image/jpeg") {
    throw new ApiError(
      415,
      "receipt_preview_type_invalid",
      "Prepare the receipt preview as a JPEG image.",
    );
  }
  const dimensions = imageDimensions(bytes, contentType);
  if (!dimensions) {
    throw new ApiError(
      415,
      "receipt_preview_invalid",
      "The receipt preview dimensions could not be verified.",
    );
  }
  const row = await database()
    .prepare(
      `SELECT r.id, r.content_type, r.sha256, e.service_date
       FROM receipts r
       JOIN expenses e
         ON e.owner_id = r.owner_id AND e.id = r.expense_id
       WHERE r.owner_id = ? AND r.expense_id = ?`,
    )
    .bind(principal.ownerId, expenseId)
    .first<PreviewReceiptRow>();
  if (!row) {
    throw new ApiError(404, "not_found", "The receipt was not found.");
  }
  if (row.content_type !== "image/heic" && row.content_type !== "image/heif") {
    throw new ApiError(
      409,
      "receipt_preview_not_required",
      "This receipt can already be previewed in the browser.",
    );
  }
  await assertDateUnlocked(principal.ownerId, row.service_date);
  const hash = await sha256Hex(bytes);
  const objectKey = directReceiptPreviewObjectKey(principal.ownerId, row.id);
  await getReceiptsBucket().put(objectKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      sha256: hash,
      width: String(dimensions.width),
      height: String(dimensions.height),
      previewProvenance: "owner-supplied-browser-preview",
      sourceReceiptId: row.id,
      sourceReceiptSha256: row.sha256.toLowerCase(),
    },
  });
  return {
    objectKey,
    contentType,
    byteSize: bytes.byteLength,
    sha256: hash,
    dimensions,
  };
}

export async function loadVerifiedReceiptPreview(
  ownerId: string,
  objectKey: string,
  expectedType: "image/jpeg" | "image/png",
) {
  if (!keyBelongsToOwner(objectKey, ownerId)) return null;
  const bucket = getReceiptsBucket();
  const head = await bucket.head(objectKey);
  if (
    !head ||
    !Number.isSafeInteger(head.size) ||
    head.size <= 0 ||
    head.size > MAX_RECEIPT_PREVIEW_BYTES
  ) {
    return null;
  }
  const object = await bucket.get(objectKey);
  if (!object) return null;
  const bytes = await streamBytes(object.body);
  if (bytes.byteLength !== head.size) return null;
  const detected = detectImageType(bytes);
  if (detected !== expectedType) return null;
  if (!imageDimensions(bytes, detected)) return null;
  const expectedHash = head.customMetadata?.sha256;
  if (!expectedHash || (await sha256Hex(bytes)) !== expectedHash.toLowerCase()) {
    return null;
  }
  return {
    body: new Response(bytes.slice().buffer).body!,
    contentType: detected,
    byteSize: bytes.byteLength,
  };
}
