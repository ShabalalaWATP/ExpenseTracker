import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { decideTripReview } from "../src/domain/receipt-trip-review.ts";

test("an untouched null does not resolve an ambiguous trip match", () => {
  assert.deepEqual(decideTripReview(null, {}), {
    tripId: null,
    explicitlySelected: false,
  });
  assert.deepEqual(decideTripReview(null, { tripId: null }), {
    tripId: null,
    explicitlySelected: false,
  });
});

test("a routine all-fields null cannot clear an existing trip", () => {
  assert.deepEqual(decideTripReview("trip-auto", { tripId: null }), {
    tripId: "trip-auto",
    explicitlySelected: false,
  });
});

test("the dedicated owner intent can leave a receipt explicitly unlinked", () => {
  assert.deepEqual(
    decideTripReview("trip-auto", {
      tripId: null,
      leaveTripUnlinked: true,
    }),
    {
      tripId: null,
      explicitlySelected: true,
    },
  );
  assert.deepEqual(
    decideTripReview(null, { leaveTripUnlinked: true }),
    {
      tripId: null,
      explicitlySelected: true,
    },
  );
});

test("selecting a different concrete trip remains an explicit decision", () => {
  assert.deepEqual(decideTripReview(null, { tripId: "trip-1" }), {
    tripId: "trip-1",
    explicitlySelected: true,
  });
  assert.deepEqual(decideTripReview("trip-auto", { tripId: "trip-owner" }), {
    tripId: "trip-owner",
    explicitlySelected: true,
  });
});

test("serialising the existing concrete trip does not convert an auto link", () => {
  assert.deepEqual(decideTripReview("trip-auto", { tripId: "trip-auto" }), {
    tripId: "trip-auto",
    explicitlySelected: false,
  });
});
