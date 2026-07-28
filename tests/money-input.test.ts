import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { parsePence } from "../app/components/format.ts";

describe("money input", () => {
  it("accepts no more than two decimal places", () => {
    assert.equal(parsePence("£12.34"), 1234);
    assert.equal(parsePence("12"), 1200);
    assert.equal(Number.isNaN(parsePence("12.345")), true);
  });

  it("rejects exponent notation and non-numeric values", () => {
    assert.equal(Number.isNaN(parsePence("1e3")), true);
    assert.equal(Number.isNaN(parsePence("free")), true);
  });
});
