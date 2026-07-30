import { getReceiptsBucket } from "@/db";
import { partitionByByteSize } from "@/src/domain/byte-partitions";
import { buildJsonExport } from "./export-service";
import { database, ensureSchema } from "./db";
import { sha256Hex, streamBytes, utf8 } from "./binary";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { buildZip, type ZipEntry } from "./zip";

type EvidenceRecord = {
  id: string;
  source: "receipt" | "intake";
  object_key: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  created_at: string;
};

const MAX_RECOVERY_PART_BYTES = 25 * 1024 * 1024;

export type RecoveryPlan = {
  totalBytes: number;
  evidenceCount: number;
  parts: Array<{ part: number; byteSize: number; evidenceCount: number }>;
};

export type IntegrityReport = {
  checkedAt: string;
  expectedObjects: number;
  storedObjects: number;
  verifiedObjects: number;
  missing: Array<{ id: string; objectKey: string }>;
  sizeMismatches: Array<{ id: string; objectKey: string }>;
  hashMismatches: Array<{ id: string; objectKey: string }>;
  orphanedObjects: string[];
  healthy: boolean;
};

function extension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/heif") return "heif";
  return contentType === "image/heic" ? "heic" : "jpg";
}

async function evidenceRows(principal: Principal): Promise<EvidenceRecord[]> {
  await ensureSchema();
  const result = await database()
    .prepare(
      `SELECT r.id, 'receipt' AS source, r.object_key, r.content_type,
              r.byte_size, r.sha256, r.created_at
       FROM receipts r
       WHERE r.owner_id = ?
       UNION ALL
       SELECT i.id, 'intake' AS source, i.original_object_key AS object_key,
              i.content_type, i.byte_size, i.sha256, i.created_at
       FROM receipt_intakes i
       WHERE i.owner_id = ?
         AND i.discarded_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM receipts r
           WHERE r.owner_id = i.owner_id
             AND r.object_key = i.original_object_key
         )
       ORDER BY created_at`,
    )
    .bind(principal.ownerId, principal.ownerId)
    .all<EvidenceRecord>();
  return result.results;
}

async function listOwnerObjects(ownerId: string): Promise<R2Object[]> {
  const bucket = getReceiptsBucket();
  const prefixes = [
    `receipts/${ownerId}/`,
    `receipt-intakes/${ownerId}/`,
  ];
  const objects: R2Object[] = [];
  for (const prefix of prefixes) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({
        prefix,
        cursor,
        limit: 1000,
        include: ["customMetadata"],
      });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  return objects;
}

export async function checkEvidenceIntegrity(
  principal: Principal,
): Promise<IntegrityReport> {
  const expected = await evidenceRows(principal);
  const stored = await listOwnerObjects(principal.ownerId);
  const expectedKeys = new Set(expected.map((row) => row.object_key));
  const missing: IntegrityReport["missing"] = [];
  const sizeMismatches: IntegrityReport["sizeMismatches"] = [];
  const hashMismatches: IntegrityReport["hashMismatches"] = [];
  let verifiedObjects = 0;
  for (const row of expected) {
    const object = await getReceiptsBucket().get(row.object_key);
    if (!object) {
      missing.push({ id: row.id, objectKey: row.object_key });
      continue;
    }
    if (object.size !== row.byte_size) {
      sizeMismatches.push({ id: row.id, objectKey: row.object_key });
      continue;
    }
    const bytes = await streamBytes(object.body);
    if ((await sha256Hex(bytes)) !== row.sha256) {
      hashMismatches.push({ id: row.id, objectKey: row.object_key });
      continue;
    }
    verifiedObjects += 1;
  }
  const orphanedObjects = stored
    .map((object) => object.key)
    .filter(
      (key) =>
        !expectedKeys.has(key) &&
        !key.includes("/analysis-"),
    );
  return {
    checkedAt: new Date().toISOString(),
    expectedObjects: expected.length,
    storedObjects: stored.length,
    verifiedObjects,
    missing,
    sizeMismatches,
    hashMismatches,
    orphanedObjects,
    healthy:
      missing.length === 0 &&
      sizeMismatches.length === 0 &&
      hashMismatches.length === 0,
  };
}

export async function getRecoveryPlan(
  principal: Principal,
): Promise<RecoveryPlan> {
  const evidence = await evidenceRows(principal);
  const parts = partitionByByteSize(
    evidence,
    (row) => row.byte_size,
    MAX_RECOVERY_PART_BYTES,
  );
  return {
    totalBytes: evidence.reduce((sum, row) => sum + row.byte_size, 0),
    evidenceCount: evidence.length,
    parts: parts.map((rows, index) => ({
      part: index + 1,
      byteSize: rows.reduce((sum, row) => sum + row.byte_size, 0),
      evidenceCount: rows.length,
    })),
  };
}

export async function buildRecoveryPackage(
  principal: Principal,
  requestedPart = 1,
): Promise<{ bytes: Uint8Array; partCount: number }> {
  const [ledger, evidence] = await Promise.all([
    buildJsonExport(principal),
    evidenceRows(principal),
  ]);
  const parts = partitionByByteSize(
    evidence,
    (row) => row.byte_size,
    MAX_RECOVERY_PART_BYTES,
  );
  if (
    !Number.isSafeInteger(requestedPart) ||
    requestedPart < 1 ||
    requestedPart > parts.length
  ) {
    throw new ApiError(404, "backup_part_not_found", "That recovery part does not exist.");
  }
  const selectedEvidence = parts[requestedPart - 1];
  const entries: ZipEntry[] = [];
  for (const row of selectedEvidence) {
    const object = await getReceiptsBucket().get(row.object_key);
    if (!object) {
      throw new ApiError(
        409,
        "backup_evidence_missing",
        `Evidence ${row.id} is missing. Run the integrity check for details.`,
      );
    }
    const bytes = await streamBytes(object.body);
    const hash = await sha256Hex(bytes);
    if (hash !== row.sha256 || bytes.byteLength !== row.byte_size) {
      throw new ApiError(
        409,
        "backup_evidence_integrity_failed",
        `Evidence ${row.id} failed its integrity check.`,
      );
    }
    const archivePath = `evidence/${row.source}-${row.id}.${extension(row.content_type)}`;
    entries.push({ name: archivePath, data: bytes, modifiedAt: new Date(row.created_at) });
  }
  const manifestEvidence = evidence.map((row) => {
    const part = parts.findIndex((rows) => rows.includes(row)) + 1;
    return {
      id: row.id,
      source: row.source,
      archivePath: `evidence/${row.source}-${row.id}.${extension(row.content_type)}`,
      contentType: row.content_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      part,
    };
  });
  const manifest = {
    schemaVersion: 1,
    app: "ExpenseTracker",
    generatedAt: new Date().toISOString(),
    package: { part: requestedPart, partCount: parts.length },
    evidence: manifestEvidence,
  };
  const recovery = [
    "ExpenseTracker recovery package",
    "",
    `This is part ${requestedPart} of ${parts.length} of a portable, owner-only backup.`,
    "Download and retain every part. Each part includes the full ledger and global evidence manifest.",
    "Keep it encrypted and private because it contains financial records and receipt images.",
    "",
    "Recovery procedure:",
    "1. Verify each evidence file against manifest.json using SHA-256.",
    "2. Review ledger.json before any restore.",
    "3. Restore only into an empty ExpenseTracker deployment using a reviewed migration tool.",
    "4. Run the integrity check after restoration.",
    "",
    "The live app deliberately does not overwrite an existing ledger automatically.",
  ].join("\n");
  entries.unshift(
    { name: "ledger.json", data: utf8(JSON.stringify(ledger, null, 2)) },
    { name: "manifest.json", data: utf8(JSON.stringify(manifest, null, 2)) },
    { name: "RECOVERY.txt", data: utf8(recovery) },
  );
  return { bytes: buildZip(entries), partCount: parts.length };
}
