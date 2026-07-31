import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { cleanTripDraft, validateTripDraft } from "../app/components/tripDraft.ts";
import type { TripDraft } from "../app/components/types.ts";

function completeDraft(): TripDraft {
  return {
    title: "Manchester supplier visit",
    location: "Manchester",
    justification: "To inspect equipment with the supplier.",
    country: "GB",
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    legs: [
      {
        sequence: 0,
        countryCode: "GB",
        location: "Manchester",
        startDate: "2026-08-10",
        endDate: "2026-08-12",
      },
    ],
    eligibleDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    attested: true,
    calculationMethod: "aggregate",
  };
}

test("the manual trip form requires explicit eligibility confirmation", () => {
  const draft = {
    ...completeDraft(),
    eligibleDates: [],
    attested: false,
  };

  assert.equal(validateTripDraft(draft), "Select and confirm the eligible dates.");
});

test("voice may save a valid itinerary pending later eligibility confirmation", () => {
  const draft = {
    ...completeDraft(),
    eligibleDates: [],
    attested: false,
  };

  assert.equal(validateTripDraft(draft, true), null);
});

test("a qualifying trip preserves the owner's aggregation choice", () => {
  assert.equal(cleanTripDraft(completeDraft()).calculationMethod, "aggregate");
  assert.equal(
    cleanTripDraft({ ...completeDraft(), calculationMethod: "daily" })
      .calculationMethod,
    "daily",
  );
});

test("aggregation is removed when the itinerary crosses countries", () => {
  const draft = completeDraft();
  draft.legs = [
    {
      sequence: 0,
      countryCode: "GB",
      location: "London",
      startDate: "2026-08-10",
      endDate: "2026-08-11",
    },
    {
      sequence: 1,
      countryCode: "FR",
      location: "Paris",
      startDate: "2026-08-11",
      endDate: "2026-08-12",
    },
  ];

  assert.equal(cleanTripDraft(draft).calculationMethod, "daily");
});

test("the trip UI and server preserve an explicit valid election", async () => {
  const [choice, client, repository, aggregation] = await Promise.all([
    readFile(
      new URL("../app/components/TripCalculationChoice.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/tripApi.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/server/trip-repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/server/trip-aggregation.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(choice, /How to apply the £30 food limit/);
  assert.match(choice, /Pool the trip allowance/);
  assert.match(client, /draft\.calculationMethod === "aggregate"/);
  assert.match(repository, /input\.aggregateElection/);
  assert.match(aggregation, /This £30 aggregation needs a UK absence of at least two nights/);
});
