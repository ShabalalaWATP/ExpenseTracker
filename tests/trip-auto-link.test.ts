import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { decideAutomaticTripLegLink, decideAutomaticTripLink, eligibleTripIdsOnDate, isExplicitTripSelectionChange, type AutomaticTripCandidate, type AutomaticTripLegCandidate } from "../src/domain/trip-auto-link.ts";

function candidate(
  id: string,
  overrides: Partial<AutomaticTripCandidate> = {},
): AutomaticTripCandidate {
  return {
    id,
    ownerId: "owner-1",
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    eligible: true,
    confirmed: true,
    ...overrides,
  };
}

test("matches confirmed eligible trip days on inclusive boundaries", () => {
  const trips = [candidate("trip-1")];

  assert.deepEqual(
    eligibleTripIdsOnDate(trips, "owner-1", "2026-08-10"),
    ["trip-1"],
  );
  assert.deepEqual(
    eligibleTripIdsOnDate(trips, "owner-1", "2026-08-12"),
    ["trip-1"],
  );
  assert.deepEqual(
    eligibleTripIdsOnDate(trips, "owner-1", "2026-08-09"),
    [],
  );
  assert.deepEqual(
    eligibleTripIdsOnDate(trips, "owner-1", "2026-08-13"),
    [],
  );
});

test("does not match eligible days until their eligibility is confirmed", () => {
  assert.deepEqual(
    eligibleTripIdsOnDate(
      [candidate("trip-1", { confirmed: false })],
      "owner-1",
      "2026-08-11",
    ),
    [],
  );
  assert.deepEqual(
    eligibleTripIdsOnDate(
      [candidate("trip-1", { eligible: false })],
      "owner-1",
      "2026-08-11",
    ),
    [],
  );
});

test("filters candidates by owner before deciding a match", () => {
  const trips = [
    candidate("owner-trip"),
    candidate("other-trip", { ownerId: "owner-2" }),
  ];

  assert.deepEqual(
    eligibleTripIdsOnDate(trips, "owner-1", "2026-08-11"),
    ["owner-trip"],
  );
});

test("links only one candidate and never guesses across overlaps", () => {
  assert.deepEqual(
    decideAutomaticTripLink(
      { tripId: null, explicitlySelected: false },
      ["trip-1"],
    ),
    { status: "matched", tripId: "trip-1" },
  );
  assert.deepEqual(
    decideAutomaticTripLink(
      { tripId: null, explicitlySelected: false },
      ["trip-2", "trip-1"],
    ),
    {
      status: "ambiguous",
      tripId: null,
      candidateTripIds: ["trip-1", "trip-2"],
    },
  );
  assert.deepEqual(
    decideAutomaticTripLink(
      { tripId: null, explicitlySelected: false },
      [],
    ),
    { status: "none", tripId: null },
  );
});

test("an explicit owner decision wins even if matching trips change", () => {
  assert.deepEqual(
    decideAutomaticTripLink(
      { tripId: "trip-explicit", explicitlySelected: true },
      ["trip-1", "trip-2"],
    ),
    { status: "explicit", tripId: "trip-explicit" },
  );
  assert.deepEqual(
    decideAutomaticTripLink(
      { tripId: null, explicitlySelected: true },
      ["trip-1"],
    ),
    { status: "explicit", tripId: null },
  );
});

test("an unchanged form value is not mistaken for an explicit trip decision", () => {
  assert.equal(isExplicitTripSelectionChange(null, null), false);
  assert.equal(
    isExplicitTripSelectionChange("trip-auto", "trip-auto"),
    false,
  );
  assert.equal(isExplicitTripSelectionChange(null, "trip-1"), true);
  assert.equal(isExplicitTripSelectionChange("trip-auto", null), true);
});

function leg(
  tripId: string,
  tripLegId: string,
  countryCode: string,
  overrides: Partial<AutomaticTripLegCandidate> = {},
): AutomaticTripLegCandidate {
  return {
    tripId,
    tripLegId,
    ownerId: "owner-1",
    countryCode,
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    eligible: true,
    confirmed: true,
    ...overrides,
  };
}

test("receipt linking returns an exact trip and leg using date and country", () => {
  assert.deepEqual(
    decideAutomaticTripLegLink(
      {
        ownerId: "owner-1",
        serviceDate: "2026-08-11",
        originalCountry: "FR",
        tripId: null,
        tripLegId: null,
        explicitlySelected: false,
      },
      [
        leg("trip-1", "leg-gb", "GB"),
        leg("trip-1", "leg-fr", "FR"),
      ],
    ),
    { status: "matched", tripId: "trip-1", tripLegId: "leg-fr" },
  );
});

test("an explicit leg must still match the receipt date, country and eligible day", () => {
  const input = {
    ownerId: "owner-1",
    serviceDate: "2026-08-20",
    originalCountry: "FR",
    tripId: "trip-1",
    tripLegId: "leg-de",
    explicitlySelected: true,
  };
  for (const candidate of [
    leg("trip-1", "leg-de", "DE", {
      startDate: "2026-08-01",
      endDate: "2026-08-03",
    }),
    leg("trip-1", "leg-de", "FR", { eligible: false }),
    leg("trip-1", "leg-de", "FR", { confirmed: false }),
  ]) {
    assert.deepEqual(
      decideAutomaticTripLegLink(input, [candidate]),
      {
        status: "invalid",
        tripId: "trip-1",
        tripLegId: "leg-de",
      },
    );
  }
});

test("an explicit valid leg resolves a same-trip itinerary ambiguity", () => {
  assert.deepEqual(
    decideAutomaticTripLegLink(
      {
        ownerId: "owner-1",
        serviceDate: "2026-08-11",
        originalCountry: null,
        tripId: "trip-1",
        tripLegId: "leg-fr",
        explicitlySelected: true,
      },
      [
        leg("trip-1", "leg-gb", "GB"),
        leg("trip-1", "leg-fr", "FR"),
      ],
    ),
    {
      status: "explicit",
      tripId: "trip-1",
      tripLegId: "leg-fr",
    },
  );
});

test("receipt linking reports country conflict and same-trip leg ambiguity", () => {
  const candidates = [
    leg("trip-1", "leg-gb", "GB"),
    leg("trip-1", "leg-fr", "FR"),
  ];
  assert.deepEqual(
    decideAutomaticTripLegLink(
      {
        ownerId: "owner-1",
        serviceDate: "2026-08-11",
        originalCountry: "DE",
        tripId: null,
        tripLegId: null,
        explicitlySelected: false,
      },
      candidates,
    ),
    {
      status: "country_conflict",
      tripId: null,
      tripLegId: null,
      candidateCountryCodes: ["FR", "GB"],
      candidateTripLegIds: ["leg-fr", "leg-gb"],
    },
  );
  assert.deepEqual(
    decideAutomaticTripLegLink(
      {
        ownerId: "owner-1",
        serviceDate: "2026-08-11",
        originalCountry: null,
        tripId: null,
        tripLegId: null,
        explicitlySelected: false,
      },
      candidates,
    ),
    {
      status: "leg_ambiguous",
      tripId: "trip-1",
      tripLegId: null,
      candidateTripLegIds: ["leg-fr", "leg-gb"],
    },
  );
});

test("receipt matching runs under the analysing lock used by claim preparation", async () => {
  const [analysis, processing, review, autoConfirmation, confirmation, claimLocks] =
    await Promise.all([
    readFile(
      new URL("../src/server/receipt-analysis-persistence.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/server/receipt-intake-processing.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/server/receipt-intake-review-repository.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/server/receipt-intake-auto-confirmation.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/server/receipt-intake-confirmation.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/server/claim-locks.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(analysis, /resolveReceiptTripLink/);
  assert.match(
    processing,
    /await beginReceiptAnalysis\([\s\S]+await persistReceiptExtraction\(/,
  );
  assert.match(
    review,
    /SET status = 'analysing'[\s\S]+resolveReceiptTripLink/,
  );
  assert.match(autoConfirmation, /await resolveReceiptTripLink/);
  assert.match(confirmation, /await resolveReceiptTripLink/);
  assert.match(
    claimLocks,
    /NOT EXISTS \([\s\S]+FROM receipt_intakes[\s\S]+status = 'analysing'/,
  );
});
