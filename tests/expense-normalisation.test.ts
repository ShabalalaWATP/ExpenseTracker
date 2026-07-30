import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { normaliseExpense, normaliseTrip } from "../app/components/expense-normalisation.ts";

test("normalises analytics coordinates and extracted receipt line items", () => {
  const expense = normaliseExpense({
    id: "expense-1",
    serviceDate: "2026-08-12",
    merchant: "Field Kitchen",
    eligiblePence: 1250,
    receiptTotalPence: 1250,
    locationCoordinates: {
      latitude: 50.80391,
      longitude: -1.08744,
      precision: "venue",
      evidence: "Printed branch address",
    },
    foodStyleTags: ["fried_chicken", "fried_chicken", "invalid"],
    lineItems: [
      {
        description: "Flat white",
        quantity: 1,
        totalPence: 350,
        eligible: true,
      },
      { description: "" },
    ],
  });
  assert.deepEqual(expense.locationCoordinates, {
    latitude: 50.80391,
    longitude: -1.08744,
    precision: "venue",
    evidence: "Printed branch address",
  });
  assert.deepEqual(expense.lineItems, [{
    description: "Flat white",
    quantity: 1,
    totalPence: 350,
    eligible: true,
  }]);
  assert.deepEqual(expense.foodStyleTags, ["fried_chicken"]);
});

test("rejects incomplete or out-of-range analytics coordinates", () => {
  assert.equal(normaliseExpense({
    locationCoordinates: {
      latitude: 91,
      longitude: -1,
      precision: "venue",
    },
  }).locationCoordinates, null);
  assert.equal(normaliseExpense({
    locationCoordinates: {
      latitude: 50,
      longitude: null,
      precision: "city",
    },
  }).locationCoordinates, null);
});

test("preserves a trip justification separately from its itinerary location", () => {
  const trip = normaliseTrip({
    id: "trip-1",
    name: "Manchester supplier visit",
    purpose: "To inspect equipment with the supplier.",
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
  });

  assert.equal(trip.location, "Manchester");
  assert.equal(trip.justification, "To inspect equipment with the supplier.");
});

test("keeps a legacy location-shaped purpose visible instead of losing data", () => {
  const trip = normaliseTrip({
    id: "trip-legacy",
    name: "Legacy visit",
    purpose: "Manchester",
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
  });

  assert.equal(trip.location, "Manchester");
  assert.equal(trip.justification, "Manchester");
});
