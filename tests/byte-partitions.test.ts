import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { partitionByByteSize } from "../src/domain/byte-partitions.ts";

test("large evidence sets are divided without exceeding the part boundary", () => {
  const parts = partitionByByteSize(
    [{ bytes: 16 }, { bytes: 16 }, { bytes: 9 }, { bytes: 7 }],
    (item) => item.bytes,
    25,
  );
  assert.deepEqual(parts, [
    [{ bytes: 16 }],
    [{ bytes: 16 }, { bytes: 9 }],
    [{ bytes: 7 }],
  ]);
  assert.ok(
    parts.every(
      (part) => part.reduce((sum, item) => sum + item.bytes, 0) <= 25,
    ),
  );
});

test("an empty evidence set still has one metadata package", () => {
  assert.deepEqual(partitionByByteSize([], () => 0, 25), [[]]);
});
