import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { resolveStoredTheme } from "../app/theme.ts";

test("new and invalid theme preferences default to dark", () => {
  assert.equal(resolveStoredTheme(null), "dark");
  assert.equal(resolveStoredTheme(undefined), "dark");
  assert.equal(resolveStoredTheme("unknown"), "dark");
});

test("saved theme preferences are preserved", () => {
  assert.equal(resolveStoredTheme("system"), "system");
  assert.equal(resolveStoredTheme("light"), "light");
  assert.equal(resolveStoredTheme("dark"), "dark");
});
