import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { EMPTY_TRIP_VOICE_DRAFT, TRIP_VOICE_DRAFT_SCHEMA, isExplicitTripSaveConfirmation, isTripVoiceDraftComplete, mergeTripVoiceDraft, tripVoiceDraftIssues } from "../src/domain/trip-voice.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { beginTripSavePrompt, canSaveTripFromVoice, emptyTripSaveGate, reduceTripSaveGate } from "../app/components/tripVoiceState.ts";

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

test("a draft is complete only with valid dates, method and eligibility", () => {
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
    calculationMethod: "aggregate",
    eligibleDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    eligibilityAttested: true,
  }).draft;
  assert.equal(isTripVoiceDraftComplete(complete), true);

  const tooShort = { ...complete, endDate: "2026-08-11" };
  assert.match(
    tripVoiceDraftIssues(tooShort)
      .map((issue) => issue.message)
      .join(" "),
    /two nights/,
  );
  assert.equal(isTripVoiceDraftComplete(tooShort), false);

  const notEligible = { ...complete, eligibilityAttested: false };
  assert.equal(isTripVoiceDraftComplete(notEligible), false);
});

test("multi-country itinerary legs must cover the trip without gaps", () => {
  const base = {
    ...EMPTY_TRIP_VOICE_DRAFT,
    title: "European meetings",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    calculationMethod: "daily" as const,
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
    transcript: "London training, 10 to 12 August. Shall I save this trip?",
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
    transcript: "Yes, please save it.",
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
  const route = await readFile(
    new URL("../app/api/ai/realtime-session/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /\/realtime\/client_secrets/);
  assert.match(server, /strict: true/);
  assert.match(server, /confirm_trip/);
  assert.match(server, /explicitly says yes/);
  assert.doesNotMatch(server, /language: "en"/);
  assert.match(client, /Authorization: `Bearer \$\{session\.value\}`/);
  assert.doesNotMatch(client, /OPENAI_API_KEY/);
  assert.match(route, /createTripRealtimeClientSecret/);
});
