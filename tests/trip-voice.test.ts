import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { automaticTripCalculationMethod } from "../src/domain/trip-calculation.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { EMPTY_TRIP_VOICE_DRAFT, TRIP_VOICE_DRAFT_SCHEMA, isExplicitTripSaveConfirmation, isTripVoiceDraftComplete, mergeTripVoiceDraft, tripVoiceDraftIssues } from "../src/domain/trip-voice.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { beginTripSavePrompt, canSaveTripFromVoice, emptyTripSaveGate, reduceTripSaveGate, synchroniseTripVoiceDraft, tripDraftFromVoice } from "../app/components/tripVoiceState.ts";

test("voice trip facts can arrive out of order without losing valid values", () => {
  const eligibilityFirst = mergeTripVoiceDraft(EMPTY_TRIP_VOICE_DRAFT, {
    eligibleDates: ["2026-08-14", "2026-08-13", "2026-08-14"],
    eligibilityAttested: true,
  });
  assert.deepEqual(eligibilityFirst.rejectedFields, []);
  assert.deepEqual(eligibilityFirst.draft.eligibleDates, [
    "2026-08-13",
    "2026-08-14",
  ]);

  const datesLater = mergeTripVoiceDraft(eligibilityFirst.draft, {
    startDate: "2026-08-13",
    endDate: "2026-08-14",
  });
  assert.equal(
    tripVoiceDraftIssues(datesLater.draft).some(
      (issue) => issue.field === "eligibleDates",
    ),
    false,
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
  const explicitNo = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    eligibilityAttested: false,
  };
  const formDraft = {
    title: "",
    location: "",
    country: "GB",
    startDate: "",
    endDate: "",
    legs: [],
    eligibleDates: [],
    attested: false,
    calculationMethod: "daily" as const,
  };
  assert.equal(
    synchroniseTripVoiceDraft(explicitNo, formDraft, true)
      .eligibilityAttested,
    false,
  );
  assert.equal(
    synchroniseTripVoiceDraft(
      { ...explicitNo, eligibilityAttested: true },
      formDraft,
      true,
    ).eligibilityAttested,
    true,
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

test("a draft is complete with valid dates, itinerary and eligibility", () => {
  const complete = mergeTripVoiceDraft(EMPTY_TRIP_VOICE_DRAFT, {
    title: "London training",
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
    eligibleDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    eligibilityAttested: true,
  }).draft;
  assert.equal(isTripVoiceDraftComplete(complete), true);

  const notEligible = { ...complete, eligibilityAttested: false };
  assert.equal(isTripVoiceDraftComplete(notEligible), false);

  assert.equal(tripDraftFromVoice(complete).calculationMethod, "aggregate");
  assert.equal(
    tripDraftFromVoice({ ...complete, endDate: "2026-08-11" })
      .calculationMethod,
    "daily",
  );
});

test("multi-country itinerary legs must cover the trip without gaps", () => {
  const base = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    title: "European meetings",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    eligibleDates: ["2026-08-10"],
    eligibilityAttested: true,
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
});

test("saving requires a clear affirmative answer to the final question", () => {
  assert.equal(isExplicitTripSaveConfirmation("Yes, please."), true);
  assert.equal(isExplicitTripSaveConfirmation("Save this trip"), true);
  assert.equal(isExplicitTripSaveConfirmation("Go ahead and save it"), true);
  assert.equal(isExplicitTripSaveConfirmation("I'm happy with that."), true);
  assert.equal(isExplicitTripSaveConfirmation("That sounds good"), true);
  assert.equal(
    isExplicitTripSaveConfirmation("Oui, enregistrez ce voyage."),
    true,
  );
  assert.equal(isExplicitTripSaveConfirmation("The dates are eligible"), false);
  assert.equal(isExplicitTripSaveConfirmation("I think so"), false);
  assert.equal(isExplicitTripSaveConfirmation("No"), false);
});

test("save confirmation is armed only after the final readback response completes", () => {
  let gate = beginTripSavePrompt(emptyTripSaveGate(), "response-update");

  gate = reduceTripSaveGate(gate, {
    type: "user_item_created",
    itemId: "eligibility-answer",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_transcript",
    itemId: "eligibility-answer",
    transcript: "Yes",
  });
  gate = reduceTripSaveGate(gate, {
    type: "response_created",
    responseId: "response-summary",
  });
  gate = reduceTripSaveGate(gate, {
    type: "assistant_transcript",
    responseId: "response-summary",
    transcript:
      "London training, 10 to 12 August. Does that all sound right, and are you happy for me to create this trip now?",
  });

  assert.equal(
    canSaveTripFromVoice(
      gate,
      "response-summary",
      isExplicitTripSaveConfirmation,
    ),
    false,
    "a tool call in the readback response is premature",
  );

  gate = reduceTripSaveGate(gate, {
    type: "response_done",
    responseId: "response-summary",
    outputItemIds: ["assistant-summary-item"],
  });
  assert.equal(gate.phase, "waiting_for_user");
  assert.equal(gate.userTranscript, "");
  assert.equal(
    canSaveTripFromVoice(
      gate,
      "response-summary",
      isExplicitTripSaveConfirmation,
    ),
    false,
  );
});

test("only the subsequent user item and its later response can save", () => {
  let gate = beginTripSavePrompt(emptyTripSaveGate(), "response-update");
  gate = reduceTripSaveGate(gate, {
    type: "response_created",
    responseId: "response-summary",
  });
  gate = reduceTripSaveGate(gate, {
    type: "response_done",
    responseId: "response-summary",
    transcript: "The eligible dates are 10 and 11 August. Shall I save this trip?",
    outputItemIds: ["assistant-summary-item"],
  });

  gate = reduceTripSaveGate(gate, {
    type: "user_transcript",
    itemId: "stale-eligibility-item",
    transcript: "Yes",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_item_created",
    itemId: "wrong-conversation-position",
    previousItemId: "older-assistant-item",
  });
  assert.equal(gate.pendingUserItem, null);

  gate = reduceTripSaveGate(gate, {
    type: "user_item_created",
    itemId: "save-answer",
    previousItemId: "assistant-summary-item",
  });
  gate = reduceTripSaveGate(gate, {
    type: "response_created",
    responseId: "response-confirm",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_item_created",
    itemId: "save-answer",
    previousItemId: "assistant-summary-item",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_transcript",
    itemId: "save-answer",
    transcript: "I'm happy with that.",
  });

  assert.equal(
    canSaveTripFromVoice(
      gate,
      "response-confirm",
      isExplicitTripSaveConfirmation,
    ),
    true,
  );
  assert.equal(
    canSaveTripFromVoice(
      gate,
      "unseen-response",
      isExplicitTripSaveConfirmation,
    ),
    false,
  );
});

test("a response created before the post-readback answer cannot confirm it", () => {
  let gate = beginTripSavePrompt(emptyTripSaveGate(), "response-update");
  gate = reduceTripSaveGate(gate, {
    type: "response_created",
    responseId: "response-summary",
  });
  gate = reduceTripSaveGate(gate, {
    type: "response_done",
    responseId: "response-summary",
    transcript: "Here is the complete summary. Shall I save this trip?",
  });
  gate = reduceTripSaveGate(gate, {
    type: "response_created",
    responseId: "premature-confirm-response",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_item_created",
    itemId: "save-answer",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_transcript",
    itemId: "save-answer",
    transcript: "Yes",
  });

  assert.equal(
    canSaveTripFromVoice(
      gate,
      "premature-confirm-response",
      isExplicitTripSaveConfirmation,
    ),
    false,
  );
});

test("trip voice uses a server-minted ephemeral credential and explicit save tool", async () => {
  const server = await readFile(
    new URL("../src/server/trip-realtime.ts", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../app/components/TripVoiceCreator.tsx", import.meta.url),
    "utf8",
  );
  const panel = await readFile(
    new URL("../app/components/TripVoicePanel.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/ai/realtime-session/route.ts", import.meta.url),
    "utf8",
  );
  const tripsView = await readFile(
    new URL("../app/components/TripsView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(server, /\/realtime\/client_secrets/);
  assert.doesNotMatch(
    server,
    /strict: true/,
    "Realtime function tools must not include the unsupported strict field",
  );
  assert.match(server, /confirm_trip/);
  assert.match(server, /Please tell me about your trip/);
  assert.match(server, /are you happy for me to create this trip now/);
  assert.match(server, /Call confirm_trip immediately/);
  assert.match(server, /Never ask again for a valid fact/);
  assert.match(server, /every stop and nation/);
  assert.doesNotMatch(server, /Collect:.*calculation method/);
  assert.doesNotMatch(server, /language: "en"/);
  assert.match(client, /Authorization: `Bearer \$\{session\.value\}`/);
  assert.match(client, /peer\.ontrack/);
  assert.match(client, /audioRef\.current\.play\(\)/);
  assert.match(client, /Please tell me about your trip/);
  assert.match(client, /function failSession[\s\S]*releaseMedia\(\)/);
  assert.ok(
    (client.match(/failSession\(/g) ?? []).length >= 3,
    "connection and save failures must both stop the microphone session",
  );
  const clientUi = `${client}\n${panel}`;
  assert.match(clientUi, /OpenAI Realtime voice/);
  assert.match(clientUi, />\s*Type instead\s*</);
  assert.doesNotMatch(clientUi, /Create this trip by speaking/);
  assert.doesNotMatch(clientUi, /\{active \? "Stop" : "Start"\}/);
  assert.doesNotMatch(client, /OPENAI_API_KEY/);
  assert.match(route, /createTripRealtimeClientSecret/);
  assert.match(tripsView, /onClick=\{startVoiceTrip\}/);
  assert.match(tripsView, /voiceRef\.current\?\.start\(draft\)/);
  assert.doesNotMatch(tripsView, /Calculation method/);
  assert.ok(
    tripsView.lastIndexOf("<TripVoiceCreator") <
      tripsView.lastIndexOf("<TripRecords"),
    "The voice creator should appear before the recorded-trip ledger.",
  );
});
