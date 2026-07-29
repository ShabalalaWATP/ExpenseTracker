import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { RECEIPT_IMAGE_DETAIL, RECEIPT_REASONING_EFFORT, receiptRequestBody } from "../src/server/receipt-request.ts";

test("receipt requests prioritise frontier reading quality", () => {
  const body = receiptRequestBody(
    "gpt-5.6-sol",
    "data:image/jpeg;base64,abc",
    "owner-hash",
    { type: "object" },
  );

  assert.equal(body.model, "gpt-5.6-sol");
  assert.equal(body.reasoning.effort, "high");
  assert.equal(RECEIPT_REASONING_EFFORT, "high");
  assert.equal(RECEIPT_IMAGE_DETAIL, "original");
  assert.equal(body.input[0].content[1].detail, "original");
  assert.equal(body.max_output_tokens, 8_000);
  assert.match(body.instructions, /Never apply the £30 allowance/);
  assert.match(body.instructions, /Include any eligible gratuity/);
  assert.match(body.instructions, /Reconcile items, discounts/);
  assert.equal(body.text.format.strict, true);
});
