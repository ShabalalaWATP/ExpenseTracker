import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { navigationHash, parseNavigationHash, replaceNavigationTarget } from "../app/components/navigation.ts";

test("navigation targets round-trip without accepting unsafe identifiers", () => {
  const hash = navigationHash({
    view: "capture",
    intakeId: "intake-123",
    date: "2026-08-14",
  });
  assert.equal(hash, "#capture?intake=intake-123&date=2026-08-14");
  assert.deepEqual(parseNavigationHash(hash), {
    view: "capture",
    intakeId: "intake-123",
    expenseId: undefined,
    tripId: undefined,
    date: "2026-08-14",
    startDate: undefined,
    endDate: undefined,
  });
  assert.equal(
    parseNavigationHash("#expenses?expense=../../secret").expenseId,
    undefined,
  );
});

test("closing a deep-linked detail replaces its history entry", () => {
  const calls: unknown[][] = [];
  const history = {
    replaceState: (...args: unknown[]) => {
      calls.push(args);
    },
  };
  replaceNavigationTarget(history, { view: "expenses" });
  assert.deepEqual(calls, [
    [{ target: { view: "expenses" } }, "", "#expenses"],
  ]);
});

test("dedicated audit and statistics tabs have safe hash routes", () => {
  assert.equal(parseNavigationHash("#audit").view, "audit");
  assert.equal(parseNavigationHash("#statistics").view, "statistics");
  assert.equal(navigationHash({ view: "audit" }), "#audit");
  assert.equal(navigationHash({ view: "statistics" }), "#statistics");
});
