// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { sha256Hex, streamBytes } from "./binary.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { detectImageType, imageDimensions } from "./receipt-image-inspection.ts";

// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
export { imageDimensions } from "./receipt-image-inspection.ts";

export const MAX_AUDIT_EVIDENCE_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIT_EVIDENCE_OBJECTS = 250;
export type AuditReceiptRecord = {
  receiptId: string;
  ownerId: string;
  expenseId: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  analysisObjectKey: string | null;
};

export type AuditReceiptExpense = {
  id: string;
  serviceDate: string;
  merchant: string;
};

export type AuditReceiptImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
  widthPx: number;
  heightPx: number;
  source: "analysis" | "owner_preview" | "original";
};

export type AuditReceiptOriginal = {
  contentType: string;
  byteSize: number;
  sha256: string;
};

export type AuditReceiptEvidence = {
  expenseId: string;
  status:
    | "embedded"
    | "missing"
    | "heic"
    | "unsupported"
    | "unavailable"
    | "integrity_failed"
    | "size_limit";
  detail: string;
  original?: AuditReceiptOriginal;
  image?: AuditReceiptImage;
};

type EvidenceBucket = Pick<R2Bucket, "get" | "head">;

type Candidate = {
  key: string;
  source: "analysis" | "owner_preview" | "original";
  expectedType: string | null;
  expectedSize: number | null;
  expectedHash: string | null;
  expectedSourceReceiptId: string | null;
  expectedSourceReceiptHash: string | null;
};

type CandidateFailure = Omit<AuditReceiptEvidence, "expenseId" | "image">;

function keyBelongsToOwner(key: string, ownerId: string): boolean {
  return (
    key.startsWith(`receipts/${ownerId}/`) ||
    key.startsWith(`receipt-intakes/${ownerId}/`) ||
    key.startsWith(`receipt-previews/${ownerId}/`)
  );
}

function analysisType(key: string): string | null {
  const lower = key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return null;
}

function originalReceipt(record: AuditReceiptRecord): AuditReceiptOriginal {
  return {
    contentType: record.contentType.toLowerCase(),
    byteSize: record.byteSize,
    sha256: record.sha256.toLowerCase(),
  };
}

function originalReceiptDetail(original: AuditReceiptOriginal): string {
  return (
    `Immutable original: ${original.contentType}, ${original.byteSize} bytes, ` +
    `SHA-256 ${original.sha256}.`
  );
}

async function loadCandidate(
  bucket: EvidenceBucket,
  candidate: Candidate,
  ownerId: string,
  remainingBytes: number,
  readBudget: { bytes: number; objects: number },
): Promise<AuditReceiptImage | CandidateFailure> {
  if (!keyBelongsToOwner(candidate.key, ownerId)) {
    return {
      status: "integrity_failed",
      detail: "Receipt storage ownership could not be verified.",
    };
  }
  if (
    candidate.expectedType &&
    candidate.expectedType !== "image/jpeg" &&
    candidate.expectedType !== "image/png"
  ) {
    return {
      status:
        candidate.expectedType === "image/heic" ||
        candidate.expectedType === "image/heif"
          ? "heic"
          : "unsupported",
      detail:
        candidate.expectedType === "image/heic" ||
        candidate.expectedType === "image/heif"
          ? "The original is HEIC/HEIF and no JPEG or PNG analysis copy is available."
          : `The stored receipt type (${candidate.expectedType}) cannot be embedded in Word.`,
    };
  }

  try {
    if (readBudget.objects <= 0) {
      return {
        status: "size_limit",
        detail: "The receipt was omitted because the report evidence object limit was reached.",
      };
    }
    readBudget.objects -= 1;
    const head = await bucket.head(candidate.key);
    if (!head) {
      return { status: "unavailable", detail: "The stored receipt object is missing." };
    }
    if (
      !Number.isSafeInteger(head.size) ||
      head.size <= 0 ||
      (candidate.expectedSize !== null && head.size !== candidate.expectedSize)
    ) {
      return {
        status: "integrity_failed",
        detail: "The stored receipt size does not match its ledger record.",
      };
    }
    if (candidate.source === "owner_preview") {
      const metadata = head.customMetadata;
      if (
        metadata?.previewProvenance !== "owner-supplied-browser-preview" ||
        metadata.sourceReceiptId !== candidate.expectedSourceReceiptId ||
        metadata.sourceReceiptSha256?.toLowerCase() !==
          candidate.expectedSourceReceiptHash?.toLowerCase()
      ) {
        return {
          status: "integrity_failed",
          detail:
            "The owner-supplied preview was excluded because its provenance is not linked to the immutable original receipt SHA-256.",
        };
      }
    }
    if (head.size > remainingBytes || head.size > readBudget.bytes) {
      return {
        status: "size_limit",
        detail: "The receipt was omitted because the report evidence limit is 25 MiB.",
      };
    }
    const object = await bucket.get(candidate.key);
    if (!object) {
      return { status: "unavailable", detail: "The stored receipt object is missing." };
    }
    const bytes = await streamBytes(object.body);
    readBudget.bytes = Math.max(0, readBudget.bytes - bytes.byteLength);
    if (bytes.byteLength !== head.size) {
      return {
        status: "integrity_failed",
        detail: "The stored receipt changed while the report was prepared.",
      };
    }
    const detected = detectImageType(bytes);
    if (detected !== "image/jpeg" && detected !== "image/png") {
      return {
        status:
          detected === "image/heic" || detected === "image/heif"
            ? "heic"
            : "unsupported",
        detail:
          detected === "image/heic" || detected === "image/heif"
            ? "The original is HEIC/HEIF and no JPEG or PNG analysis copy is available."
            : "The stored file is not a supported JPEG or PNG image.",
      };
    }
    if (candidate.expectedType && detected !== candidate.expectedType) {
      return {
        status: "integrity_failed",
        detail: "The receipt content does not match its recorded image type.",
      };
    }
    const expectedHash =
      candidate.expectedHash ?? head.customMetadata?.sha256 ?? null;
    if (!expectedHash) {
      return {
        status: "integrity_failed",
        detail: "The stored receipt has no SHA-256 integrity metadata.",
      };
    }
    if ((await sha256Hex(bytes)) !== expectedHash.toLowerCase()) {
      return {
        status: "integrity_failed",
        detail: "The stored receipt failed its SHA-256 integrity check.",
      };
    }
    const dimensions = imageDimensions(bytes, detected);
    if (!dimensions) {
      return {
        status: "unsupported",
        detail: "The receipt image dimensions could not be read safely.",
      };
    }
    return {
      bytes,
      contentType: detected,
      widthPx: dimensions.width,
      heightPx: dimensions.height,
      source: candidate.source,
    };
  } catch {
    return {
      status: "unavailable",
      detail: "The receipt could not be loaded from secure storage.",
    };
  }
}

function candidateFailure(value: AuditReceiptImage | CandidateFailure): value is CandidateFailure {
  return "status" in value;
}

export async function loadAuditReceiptEvidence(
  ownerId: string,
  expenses: readonly AuditReceiptExpense[],
  records: ReadonlyMap<string, AuditReceiptRecord>,
  bucket: EvidenceBucket,
  maxBytes = MAX_AUDIT_EVIDENCE_BYTES,
  maxObjects = MAX_AUDIT_EVIDENCE_OBJECTS,
): Promise<AuditReceiptEvidence[]> {
  const evidence: AuditReceiptEvidence[] = [];
  let includedBytes = 0;
  const readBudget = {
    bytes: Math.max(0, maxBytes),
    objects: Math.max(0, maxObjects),
  };
  for (const expense of expenses) {
    const record = records.get(expense.id);
    if (!record || record.ownerId !== ownerId) {
      evidence.push({
        expenseId: expense.id,
        status: "missing",
        detail: "No receipt image is attached to this expense.",
      });
      continue;
    }
    const candidates: Candidate[] = [];
    if (record.analysisObjectKey) {
      const ownerPreview = record.analysisObjectKey.startsWith(
        "receipt-previews/",
      );
      candidates.push({
        key: record.analysisObjectKey,
        source: ownerPreview ? "owner_preview" : "analysis",
        expectedType: analysisType(record.analysisObjectKey),
        expectedSize: null,
        expectedHash: null,
        expectedSourceReceiptId: ownerPreview ? record.receiptId : null,
        expectedSourceReceiptHash: ownerPreview ? record.sha256 : null,
      });
    }
    candidates.push({
      key: record.objectKey,
      source: "original",
      expectedType: record.contentType.toLowerCase(),
      expectedSize: record.byteSize,
      expectedHash: record.sha256,
      expectedSourceReceiptId: null,
      expectedSourceReceiptHash: null,
    });

    let lastFailure: CandidateFailure = {
      status: "unavailable",
      detail: "No usable receipt image could be loaded.",
    };
    let ownerPreviewIntegrityFailure: CandidateFailure | null = null;
    let selected: AuditReceiptImage | null = null;
    for (const candidate of candidates) {
      const result = await loadCandidate(
        bucket,
        candidate,
        ownerId,
        Math.max(0, maxBytes - includedBytes),
        readBudget,
      );
      if (candidateFailure(result)) {
        lastFailure = result;
        if (
          candidate.source === "owner_preview" &&
          result.status === "integrity_failed"
        ) {
          ownerPreviewIntegrityFailure = result;
        }
        continue;
      }
      selected = result;
      break;
    }
    if (selected) {
      includedBytes += selected.bytes.byteLength;
      const original = originalReceipt(record);
      evidence.push({
        expenseId: expense.id,
        status: "embedded",
        detail:
          selected.source === "owner_preview"
            ? `${originalReceiptDetail(original)} The embedded JPEG is an owner-supplied browser-created preview, linked to that SHA-256 in secure storage metadata; it is non-authoritative and is not the immutable original.`
            : selected.source === "analysis"
              ? `${originalReceiptDetail(original)} Embedded from the secure JPEG/PNG analysis copy.`
              : `${originalReceiptDetail(original)} The embedded image is the hash-verified immutable original.`,
        original,
        image: selected,
      });
    } else {
      const original = originalReceipt(record);
      const failure = ownerPreviewIntegrityFailure ?? lastFailure;
      evidence.push({
        expenseId: expense.id,
        ...failure,
        detail: `${originalReceiptDetail(original)} ${failure.detail}`,
        original,
      });
    }
  }
  return evidence;
}
