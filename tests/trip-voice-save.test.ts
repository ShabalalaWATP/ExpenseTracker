import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { isExplicitTripSaveConfirmation } from "../src/domain/trip-voice.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { beginTripSavePrompt, canSaveTripFromVoice, emptyTripSaveGate, reduceTripSaveGate } from "../app/components/tripVoiceState.ts";

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
    itemId: "earlier-answer",
  });
  gate = reduceTripSaveGate(gate, {
    type: "user_transcript",
    itemId: "earlier-answer",
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
    transcript: "The trip is 10 to 11 August. Shall I save this trip?",
    outputItemIds: ["assistant-summary-item"],
  });

  gate = reduceTripSaveGate(gate, {
    type: "user_transcript",
    itemId: "stale-item",
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

test("a save phrase inside a field readback cannot arm confirmation", () => {
  let gate = beginTripSavePrompt(emptyTripSaveGate(), "response-update");
  gate = reduceTripSaveGate(gate, {
    type: "response_created",
    responseId: "response-summary",
  });
  gate = reduceTripSaveGate(gate, {
    type: "response_done",
    responseId: "response-summary",
    transcript:
      "Trip title: Shall I save this trip? Is that title correct?",
  });

  assert.equal(gate.phase, "inactive");
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
  assert.match(
    server,
    /trip name, location, dates and short reason all in one go/,
  );
  assert.match(server, /are you happy for me to create this trip now/);
  assert.match(server, /Call confirm_trip immediately/);
  assert.match(server, /Never ask again for a valid fact/);
  assert.match(server, /Never re-ask known overall or leg dates/);
  assert.match(server, /whole utterance at once/);
  assert.match(
    server,
    /one concise question about only the first genuinely unresolved fact/,
  );
  assert.match(
    server,
    /every stop and nation, all dates, and the justification/,
  );
  assert.doesNotMatch(server, /eligib/i);
  assert.doesNotMatch(server, /absence exceeded five hours/i);
  assert.doesNotMatch(server, /Collect:.*calculation method/);
  assert.doesNotMatch(server, /language: "en"/);
  assert.match(client, /Authorization: `Bearer \$\{session\.value\}`/);
  assert.match(client, /peer\.ontrack/);
  assert.match(client, /audioRef\.current\.play\(\)/);
  assert.match(
    client,
    /Please tell me your trip name, where you went, the dates, and a brief reason/,
  );
  assert.match(client, /Extract all four details from the answer in one update/);
  assert.match(client, /never ask again for valid dates already in the draft/);
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
