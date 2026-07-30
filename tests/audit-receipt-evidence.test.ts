import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { sha256Hex } from "../src/server/binary.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { imageDimensions, loadAuditReceiptEvidence, type AuditReceiptRecord } from "../src/server/audit-receipt-evidence.ts";

function png(width = 2, height = 3): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width = 300, height = 600): Uint8Array {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8]);
  bytes[7] = height >> 8;
  bytes[8] = height & 0xff;
  bytes[9] = width >> 8;
  bytes[10] = width & 0xff;
  return bytes;
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function bucket(
  objects: Record<string, Uint8Array>,
  metadata: Record<string, Record<string, string>> = {},
) {
  const gets: string[] = [];
  const heads: string[] = [];
  const hashes = new Map(
    await Promise.all(
      Object.entries(objects).map(async ([key, bytes]) => [
        key,
        await sha256Hex(bytes),
      ] as const),
    ),
  );
  return {
    gets,
    heads,
    async head(key: string) {
      heads.push(key);
      const bytes = objects[key];
      return bytes
        ? {
            key,
            size: bytes.byteLength,
            httpEtag: "test",
            customMetadata: {
              sha256: hashes.get(key)!,
              ...metadata[key],
            },
          }
        : null;
    },
    async get(key: string) {
      gets.push(key);
      const bytes = objects[key];
      return bytes
        ? { body: stream(bytes), httpEtag: "test", size: bytes.byteLength }
        : null;
    },
  };
}

async function record(
  overrides: Partial<AuditReceiptRecord> = {},
): Promise<AuditReceiptRecord> {
  const original = png();
  return {
    receiptId: "receipt-1",
    ownerId: "owner-1",
    expenseId: "expense-1",
    objectKey: "receipts/owner-1/original.png",
    contentType: "image/png",
    byteSize: original.byteLength,
    sha256: await sha256Hex(original),
    analysisObjectKey: null,
    ...overrides,
  };
}

describe("audit receipt evidence", () => {
  it("prefers an owned JPEG/PNG analysis copy over the original", async () => {
    const analysis = jpeg();
    const original = png();
    const store = await bucket({
      "receipt-intakes/owner-1/intake-1/analysis.jpg": analysis,
      "receipts/owner-1/original.png": original,
    });
    const row = await record({
      analysisObjectKey: "receipt-intakes/owner-1/intake-1/analysis.jpg",
    });
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
    );
    assert.equal(result.status, "embedded");
    assert.equal(result.image?.source, "analysis");
    assert.deepEqual(
      { width: result.image?.widthPx, height: result.image?.heightPx },
      { width: 300, height: 600 },
    );
    assert.deepEqual(store.gets, [
      "receipt-intakes/owner-1/intake-1/analysis.jpg",
    ]);
  });

  it("falls back to the hash-verified original when the analysis copy is unavailable", async () => {
    const original = png(800, 1200);
    const store = await bucket({ "receipts/owner-1/original.png": original });
    const row = await record({
      byteSize: original.byteLength,
      sha256: await sha256Hex(original),
      analysisObjectKey: "receipt-intakes/owner-1/intake-1/analysis.jpg",
    });
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
    );
    assert.equal(result.status, "embedded");
    assert.equal(result.image?.source, "original");
    assert.equal(result.image?.heightPx, 1200);
  });

  it("does not read cross-owner object keys and reports the integrity failure", async () => {
    const store = await bucket({ "receipts/owner-2/original.png": png() });
    const row = await record({ objectKey: "receipts/owner-2/original.png" });
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
    );
    assert.equal(result.status, "integrity_failed");
    assert.deepEqual(store.heads, []);
    assert.deepEqual(store.gets, []);
  });

  it("reports HEIC originals explicitly when there is no analysis copy", async () => {
    const store = await bucket({});
    const row = await record({
      objectKey: "receipts/owner-1/original.heic",
      contentType: "image/heic",
    });
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
    );
    assert.equal(result.status, "heic");
    assert.match(result.detail, /HEIC\/HEIF/);
  });

  it("embeds an owned direct-attachment JPEG sidecar for a HEIC original", async () => {
    const preview = jpeg(720, 1280);
    const row = await record({
      objectKey: "receipts/owner-1/original.heic",
      contentType: "image/heic",
      analysisObjectKey: "receipt-previews/owner-1/receipt-1.jpg",
    });
    const store = await bucket(
      {
        "receipt-previews/owner-1/receipt-1.jpg": preview,
      },
      {
        "receipt-previews/owner-1/receipt-1.jpg": {
          previewProvenance: "owner-supplied-browser-preview",
          sourceReceiptId: row.receiptId,
          sourceReceiptSha256: row.sha256,
        },
      },
    );
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
    );
    assert.equal(result.status, "embedded");
    assert.equal(result.image?.source, "owner_preview");
    assert.equal(result.image?.contentType, "image/jpeg");
    assert.match(result.detail, /owner-supplied browser-created preview/);
    assert.match(result.detail, /non-authoritative/);
    assert.match(result.detail, new RegExp(row.sha256));
    assert.equal(result.original?.sha256, row.sha256);
  });

  it("excludes a direct HEIC preview that is not tied to the immutable original hash", async () => {
    const preview = jpeg(720, 1280);
    const row = await record({
      objectKey: "receipts/owner-1/original.heic",
      contentType: "image/heic",
      analysisObjectKey: "receipt-previews/owner-1/receipt-1.jpg",
    });
    const store = await bucket(
      {
        "receipt-previews/owner-1/receipt-1.jpg": preview,
      },
      {
        "receipt-previews/owner-1/receipt-1.jpg": {
          previewProvenance: "owner-supplied-browser-preview",
          sourceReceiptId: row.receiptId,
          sourceReceiptSha256: "0".repeat(64),
        },
      },
    );
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
    );
    assert.equal(result.status, "integrity_failed");
    assert.match(result.detail, /immutable original receipt SHA-256/);
    assert.equal(result.image, undefined);
    assert.deepEqual(store.gets, []);
  });

  it("enforces a cumulative evidence byte limit", async () => {
    const first = png(10, 20);
    const second = png(20, 40);
    const store = await bucket({
      "receipts/owner-1/first.png": first,
      "receipts/owner-1/second.png": second,
    });
    const firstRecord = await record({
      objectKey: "receipts/owner-1/first.png",
      byteSize: first.byteLength,
      sha256: await sha256Hex(first),
    });
    const secondRecord = await record({
      expenseId: "expense-2",
      objectKey: "receipts/owner-1/second.png",
      byteSize: second.byteLength,
      sha256: await sha256Hex(second),
    });
    const results = await loadAuditReceiptEvidence(
      "owner-1",
      [
        { id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" },
        { id: "expense-2", serviceDate: "2026-08-05", merchant: "Shop" },
      ],
      new Map([
        ["expense-1", firstRecord],
        ["expense-2", secondRecord],
      ]),
      store,
      first.byteLength,
    );
    assert.deepEqual(
      results.map((item) => item.status),
      ["embedded", "size_limit"],
    );
    assert.ok(!store.gets.includes("receipts/owner-1/second.png"));
  });

  it("stops fallback reads after the evidence object budget is exhausted", async () => {
    const malformed = new Uint8Array(24);
    const original = png();
    const store = await bucket({
      "receipt-intakes/owner-1/intake-1/analysis.jpg": malformed,
      "receipts/owner-1/original.png": original,
    });
    const row = await record({
      byteSize: original.byteLength,
      sha256: await sha256Hex(original),
      analysisObjectKey: "receipt-intakes/owner-1/intake-1/analysis.jpg",
    });
    const [result] = await loadAuditReceiptEvidence(
      "owner-1",
      [{ id: "expense-1", serviceDate: "2026-08-04", merchant: "Cafe" }],
      new Map([["expense-1", row]]),
      store,
      1_024,
      1,
    );
    assert.equal(result.status, "size_limit");
    assert.deepEqual(store.heads, [
      "receipt-intakes/owner-1/intake-1/analysis.jpg",
    ]);
    assert.ok(!store.gets.includes("receipts/owner-1/original.png"));
  });

  it("reads JPEG and PNG dimensions without changing aspect metadata", () => {
    assert.deepEqual(imageDimensions(png(640, 960), "image/png"), {
      width: 640,
      height: 960,
    });
    assert.deepEqual(imageDimensions(jpeg(900, 1600), "image/jpeg"), {
      width: 900,
      height: 1600,
    });
  });
});
