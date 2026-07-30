import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { countryName, formatCurrencyMinor } from "../app/components/format.ts";

test("formats authoritative minor-unit values and country names", () => {
  assert.equal(formatCurrencyMinor(12345, "EUR", 2), "€123.45");
  assert.match(formatCurrencyMinor(1234, "JPY", 0), /1,234/);
  assert.equal(countryName("FR"), "France");
});

test("international receipt UI separates originals from GBP policy values", async () => {
  const [facts, review, origin, editor, list, receiptApi] = await Promise.all([
    readFile(
      new URL(
        "../app/components/receipt-intake/InternationalReceiptFacts.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/receipt-intake/IntakeReview.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/receipt-intake/IntakeOriginFallback.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ExpenseEditor.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/ExpensesView.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/receipt-intake/receiptApi.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(facts, /Authoritative receipt/);
  assert.match(facts, /Frozen GBP policy equivalent/);
  assert.match(facts, /conversion-provenance/);
  assert.match(editor, /Original receipt facts stay unchanged/);
  assert.match(list, /originalEligibleMinor/);
  assert.match(receiptApi, /normaliseReceiptIntake/);
  assert.match(review, /IntakeOriginFallback/);
  assert.match(origin, /Receipt origin fallback/);
  assert.match(origin, /originalCurrency/);
  assert.match(origin, /originalCountry/);
});

test("trip UI sends and reads an ordered repeatable itinerary", async () => {
  const [editor, tripApi, summary] = await Promise.all([
    readFile(
      new URL("../app/components/TripLegEditor.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/components/tripApi.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/components/TripVoiceDraftSummary.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(editor, /Add another leg/);
  assert.match(editor, /countryName\(code\)/);
  assert.match(editor, /Move leg/);
  assert.match(tripApi, /legs,/);
  assert.match(tripApi, /sequence: index/);
  assert.match(tripApi, /purpose: draft\.justification/);
  assert.doesNotMatch(tripApi, /purpose: draft\.location/);
  assert.match(summary, /draft\.legs\.map/);
  assert.match(summary, /Reason/);
});
