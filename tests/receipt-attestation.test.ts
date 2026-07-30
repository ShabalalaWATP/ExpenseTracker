import assert from "node:assert/strict";
import { it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { isReceiptAttested } from "../src/server/receipt-attestation.ts";

it("requires an explicit true owner receipt attestation", () => {
  assert.equal(isReceiptAttested({ attested: true }), true);
  assert.equal(isReceiptAttested(null), false);
  assert.equal(isReceiptAttested({}), false);
  assert.equal(isReceiptAttested({ attested: false }), false);
  assert.equal(isReceiptAttested({ attested: "true" }), false);
});
