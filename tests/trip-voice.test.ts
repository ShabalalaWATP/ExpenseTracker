import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { automaticTripCalculationMethod } from "../src/domain/trip-calculation.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { EMPTY_TRIP_VOICE_DRAFT, TRIP_VOICE_DRAFT_SCHEMA, isTripVoiceDraftComplete, mergeTripVoiceDraft, tripVoiceDraftIssues } from "../src/domain/trip-voice.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { synchroniseTripVoiceDraft, tripDraftFromVoice } from "../app/components/tripVoiceState.ts";

test("voice trip facts can arrive out of order without losing valid values", () => {
  const reasonFirst = mergeTripVoiceDraft(EMPTY_TRIP_VOICE_DRAFT, {
    justification: "To attend an engineering planning meeting.",
  });
  assert.deepEqual(reasonFirst.rejectedFields, []);
  assert.equal(
    reasonFirst.draft.justification,
    "To attend an engineering planning meeting.",
  );

  const datesLater = mergeTripVoiceDraft(reasonFirst.draft, {
    startDate: "2026-08-13",
    endDate: "2026-08-14",
  });
  assert.equal(datesLater.draft.startDate, "2026-08-13");
  assert.equal(
    datesLater.draft.justification,
    "To attend an engineering planning meeting.",
  );
});

test("invalid partial values are rejected and valid draft facts are preserved", () => {
  const current = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    title: "Portsmouth training",
    startDate: "2026-08-13",
  };
  const merged = mergeTripVoiceDraft(current, {
    title: "",
    startDate: "13 August",
    legs: [
      {
        countryCode: "gb",
        location: "Portsmouth",
        startDate: "2026-08-13",
        endDate: "2026-08-14",
      },
    ],
  });
  assert.deepEqual(merged.rejectedFields, ["title", "startDate", "legs"]);
  assert.equal(merged.draft.title, "Portsmouth training");
  assert.equal(merged.draft.startDate, "2026-08-13");
  assert.equal(merged.draft.legs, null);
});

test("null placeholders cannot erase facts already captured from speech", () => {
  const current = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    title: "Portsmouth training",
    startDate: "2026-08-13",
  };
  const merged = mergeTripVoiceDraft(current, {
    title: null,
    startDate: null,
    endDate: "2026-08-15",
  });
  assert.equal(merged.draft.title, "Portsmouth training");
  assert.equal(merged.draft.startDate, "2026-08-13");
  assert.equal(merged.draft.endDate, "2026-08-15");
});

test("active voice memory survives lossy parent form updates", () => {
  const spokenDraft = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    justification: "To deliver mandatory equipment training.",
  };
  const formDraft = {
    title: "",
    location: "",
    justification: "",
    country: "GB",
    startDate: "",
    endDate: "",
    legs: [],
    eligibleDates: [],
    attested: false,
    calculationMethod: "daily" as const,
  };
  assert.equal(
    synchroniseTripVoiceDraft(spokenDraft, formDraft, true).justification,
    "To deliver mandatory equipment training.",
  );
  assert.equal(
    synchroniseTripVoiceDraft(
      spokenDraft,
      formDraft,
      false,
    ).justification,
    null,
  );
});

test("trip calculation is automatic from inclusive calendar duration", () => {
  assert.equal(
    automaticTripCalculationMethod("2026-08-10", "2026-08-10"),
    "daily",
  );
  assert.equal(
    automaticTripCalculationMethod("2026-08-10", "2026-08-11"),
    "daily",
  );
  assert.equal(
    automaticTripCalculationMethod("2026-08-10", "2026-08-12"),
    "aggregate",
  );
});

test("a complete one-utterance-shaped payload needs no follow-up", () => {
  const complete = mergeTripVoiceDraft(EMPTY_TRIP_VOICE_DRAFT, {
    title: "London and Paris planning",
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    legs: [
      {
        countryCode: "GB",
        location: "London",
        startDate: "2026-08-10",
        endDate: "2026-08-11",
      },
      {
        countryCode: "FR",
        location: "Paris",
        startDate: "2026-08-11",
        endDate: "2026-08-12",
      },
    ],
    justification:
      "To attend planning meetings with the UK and French engineering teams.",
  }).draft;
  assert.equal(isTripVoiceDraftComplete(complete), true);
  assert.deepEqual(tripVoiceDraftIssues(complete), []);

  assert.equal(tripDraftFromVoice(complete).calculationMethod, "aggregate");
  assert.equal(
    tripDraftFromVoice({ ...complete, endDate: "2026-08-11" })
      .calculationMethod,
    "daily",
  );
  assert.equal(
    tripDraftFromVoice(complete).justification,
    "To attend planning meetings with the UK and French engineering teams.",
  );
  assert.deepEqual(tripDraftFromVoice(complete).eligibleDates, []);
  assert.equal(tripDraftFromVoice(complete).attested, false);
});

test("a single location inherits the overall dates without another question", () => {
  const result = mergeTripVoiceDraft(EMPTY_TRIP_VOICE_DRAFT, {
    title: "Manchester supplier visit",
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    legs: [
      {
        countryCode: "GB",
        location: "Manchester",
        startDate: null,
        endDate: null,
      },
    ],
    justification: "To inspect equipment with the supplier.",
  });

  assert.deepEqual(result.rejectedFields, []);
  assert.deepEqual(result.draft.legs, [
    {
      countryCode: "GB",
      location: "Manchester",
      startDate: "2026-08-10",
      endDate: "2026-08-12",
    },
  ]);
  assert.deepEqual(tripVoiceDraftIssues(result.draft), []);

  const corrected = mergeTripVoiceDraft(result.draft, {
    startDate: "2026-08-11",
    endDate: "2026-08-13",
    legs: result.draft.legs,
  });
  assert.deepEqual(corrected.draft.legs, [
    {
      countryCode: "GB",
      location: "Manchester",
      startDate: "2026-08-11",
      endDate: "2026-08-13",
    },
  ]);
  assert.deepEqual(tripVoiceDraftIssues(corrected.draft), []);
});

test("multi-country itinerary legs must cover the trip without gaps", () => {
  const base = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    title: "European meetings",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    justification: "To meet partner teams in London and Paris.",
  };
  const withGap = mergeTripVoiceDraft(base, {
    legs: [
      {
        countryCode: "GB",
        location: "London",
        startDate: "2026-08-10",
        endDate: "2026-08-11",
      },
      {
        countryCode: "FR",
        location: "Paris",
        startDate: "2026-08-13",
        endDate: "2026-08-14",
      },
    ],
  }).draft;
  assert.equal(isTripVoiceDraftComplete(withGap), false);
  assert.match(
    tripVoiceDraftIssues(withGap).map((issue) => issue.message).join(" "),
    /without gaps/,
  );

  const transition = mergeTripVoiceDraft(base, {
    legs: [
      {
        countryCode: "GB",
        location: "London",
        startDate: "2026-08-10",
        endDate: "2026-08-12",
      },
      {
        countryCode: "FR",
        location: "Paris",
        startDate: "2026-08-12",
        endDate: "2026-08-14",
      },
    ],
  }).draft;
  assert.equal(isTripVoiceDraftComplete(transition), true);
});

test("Realtime draft tool uses a closed, fully required schema", () => {
  assert.equal(TRIP_VOICE_DRAFT_SCHEMA.additionalProperties, false);
  assert.deepEqual(
    [...TRIP_VOICE_DRAFT_SCHEMA.required].sort(),
    Object.keys(TRIP_VOICE_DRAFT_SCHEMA.properties).sort(),
  );
  assert.deepEqual(
    Object.keys(TRIP_VOICE_DRAFT_SCHEMA.properties).sort(),
    ["endDate", "justification", "legs", "startDate", "title"],
  );
  assert.equal("eligibleDates" in TRIP_VOICE_DRAFT_SCHEMA.properties, false);
  assert.equal(
    "eligibilityAttested" in TRIP_VOICE_DRAFT_SCHEMA.properties,
    false,
  );
});
