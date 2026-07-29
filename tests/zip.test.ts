import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { buildTextPdf } from "../src/server/simple-pdf.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { utf8 } from "../src/server/binary.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { buildZip } from "../src/server/zip.ts";

test("submission archives contain valid store-only ZIP and PDF markers", () => {
  const pdf = buildTextPdf(["ExpenseTracker", "Claim summary"]);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 8)), "%PDF-1.4");
  const zip = buildZip([
    { name: "manifest.json", data: utf8('{"ok":true}') },
    { name: "claim-summary.pdf", data: pdf },
  ]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(zip.byteLength - 22, true), 0x06054b50);
  const text = new TextDecoder().decode(zip);
  assert.match(text, /manifest\.json/);
  assert.match(text, /claim-summary\.pdf/);
});
