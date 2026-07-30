import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import {
  MAX_ANALYSIS_DIMENSION,
  MAX_ANALYSIS_PIXELS,
  cropGeometry,
  normaliseImageEdits,
} from "../app/components/receipt-intake/image.ts";

test("receipt analysis derivatives stay within the low-latency vision budget", () => {
  assert.equal(MAX_ANALYSIS_DIMENSION, 2560);
  assert.equal(MAX_ANALYSIS_PIXELS, 5_000_000);
});

test("receipt image adjustments stay within safe crop and contrast bounds", () => {
  const edits = normaliseImageEdits({
    rotation: 90,
    contrast: 9,
    cropLeft: 0.3,
    cropRight: 0.3,
    cropTop: -2,
    cropBottom: 0.2,
  });
  assert.equal(edits.rotation, 90);
  assert.equal(edits.contrast, 1.8);
  assert.deepEqual(cropGeometry(1000, 2000, edits), {
    x: 300,
    y: 0,
    width: 400,
    height: 1600,
  });
});
