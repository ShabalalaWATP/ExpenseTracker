import assert from "node:assert/strict";
import test from "node:test";
import {
  RECEIPT_EXTRACTION_PROMPT_CACHE_KEY,
  RECEIPT_IMAGE_DETAIL,
  RECEIPT_REASONING_EFFORT,
  RECEIPT_VERIFICATION_IMAGE_DETAIL,
  receiptRequestBody,
// @ts-expect-error Node's TypeScript stripping requires the source extension.
} from "../src/server/receipt-request.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { RECEIPT_EXTRACTION_SCHEMA } from "../src/server/receipt-extraction-schema.ts";

function collectSchemaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectSchemaKeys(child, keys);
  }
  return keys;
}

test("receipt requests use low reasoning for faster extraction", () => {
  const body = receiptRequestBody(
    "gpt-5.6-sol",
    "data:image/jpeg;base64,abc",
    "owner-hash",
    { type: "object" },
  );

  assert.equal(body.model, "gpt-5.6-sol");
  assert.equal(body.reasoning.effort, "low");
  assert.equal(RECEIPT_REASONING_EFFORT, "low");
  assert.equal(RECEIPT_IMAGE_DETAIL, "original");
  assert.equal(RECEIPT_VERIFICATION_IMAGE_DETAIL, "high");
  assert.equal(body.input[0].content[1].detail, "original");
  assert.equal(
    body.prompt_cache_key,
    RECEIPT_EXTRACTION_PROMPT_CACHE_KEY,
  );
  assert.equal(body.max_output_tokens, 8_000);
  assert.match(body.instructions, /Never apply the £30 allowance/);
  assert.match(body.instructions, /Include any eligible gratuity/);
  assert.match(body.instructions, /Reconcile items, discounts/);
  assert.match(body.instructions, /24-hour HH:mm/);
  assert.match(body.instructions, /05:00-10:59 breakfast/);
  assert.match(body.instructions, /Return null for every non-food receipt/);
  assert.match(body.instructions, /Never invent duty, purpose, authorisation/);
  assert.match(body.instructions, /ISO 3166-1 alpha-2 country/);
  assert.match(body.instructions, /original Unicode script/);
  assert.equal(body.text.format.strict, true);
});

test("receipt structured output schema uses OpenAI-supported keywords", () => {
  const keys = collectSchemaKeys(RECEIPT_EXTRACTION_SCHEMA);
  assert.equal(keys.has("uniqueItems"), false);
});
