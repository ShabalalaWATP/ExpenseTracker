import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { canSelectReceipt } from "../app/components/receipt-intake/image.ts";

describe("iPhone receipt selection", () => {
  it("allows a bounded HEIC photo when Safari leaves File.type blank", () => {
    assert.equal(canSelectReceipt({ size: 2_000_000, type: "" }), true);
  });

  it("rejects empty, oversized and explicit non-image files", () => {
    assert.equal(canSelectReceipt({ size: 0, type: "image/jpeg" }), false);
    assert.equal(
      canSelectReceipt({ size: 21 * 1_048_576, type: "image/heic" }),
      false,
    );
    assert.equal(canSelectReceipt({ size: 100, type: "text/html" }), false);
  });
});
