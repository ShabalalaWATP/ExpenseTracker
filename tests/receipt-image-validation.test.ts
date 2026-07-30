import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_RECEIPT_SOURCE_PIXELS,
  imageDimensions,
  safeReceiptImageDimensions,
// @ts-expect-error Node's TypeScript stripping requires the source extension.
} from "../src/server/receipt-image-inspection.ts";
import {
  safeReceiptSourceDimensions,
  validateReceiptSourceDimensions,
// @ts-expect-error Node's TypeScript stripping requires the source extension.
} from "../app/components/receipt-intake/image.ts";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8]);
  bytes[7] = height >> 8;
  bytes[8] = height & 0xff;
  bytes[9] = width >> 8;
  bytes[10] = width & 0xff;
  return bytes;
}

function imageBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer as ArrayBuffer]);
}

describe("receipt source image limits", () => {
  it("preserves 48 MP iPhone receipt photos", () => {
    const dimensions = { width: 8064, height: 6048 };
    assert.ok(dimensions.width * dimensions.height < MAX_RECEIPT_SOURCE_PIXELS);
    assert.equal(safeReceiptImageDimensions(dimensions), true);
    assert.equal(safeReceiptSourceDimensions(dimensions), true);
  });

  it("reads oversized dimensions from tiny PNG and JPEG payloads", () => {
    assert.deepEqual(imageDimensions(png(100_000, 100_000), "image/png"), {
      width: 100_000,
      height: 100_000,
    });
    assert.deepEqual(imageDimensions(jpeg(12_001, 6_000), "image/jpeg"), {
      width: 12_001,
      height: 6_000,
    });
    assert.equal(
      safeReceiptImageDimensions({ width: 10_000, height: 10_000 }),
      false,
    );
  });

  it("rejects an oversized PNG before browser decoding", async () => {
    await assert.rejects(
      validateReceiptSourceDimensions(imageBlob(png(100_000, 100_000))),
      /unsafe dimensions/,
    );
  });

  it("rejects an oversized JPEG before browser decoding", async () => {
    await assert.rejects(
      validateReceiptSourceDimensions(imageBlob(jpeg(12_001, 6_000))),
      /unsafe dimensions/,
    );
  });
});
