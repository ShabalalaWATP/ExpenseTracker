import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { validateTripDraft } from "../app/components/tripDraft.ts";
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
