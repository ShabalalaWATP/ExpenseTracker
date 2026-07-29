"use client";

import type { DashboardData, MealContext } from "../types";
import type { BatchDefaults } from "./types";

export function IntakeDefaults({
  data,
  value,
  onChange,
}: {
  data: DashboardData;
  value: BatchDefaults;
  onChange: (next: BatchDefaults) => void;
}) {
  function update<K extends keyof BatchDefaults>(
    field: K,
    next: BatchDefaults[K],
  ) {
    onChange({ ...value, [field]: next });
  }

  return (
    <details className="intake-defaults">
      <summary>
        <span>
          <strong>Shared details</strong>
          <small>Applied to every photo in the next batch</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="intake-default-fields">
        <label>
          <span>Claim date</span>
          <input
            type="date"
            value={value.serviceDate}
            onChange={(event) => update("serviceDate", event.target.value)}
          />
        </label>
        <label>
          <span>Location</span>
          <input
            autoComplete="address-level2"
            value={value.location}
            onChange={(event) => update("location", event.target.value)}
            placeholder="Town, venue or duty station"
          />
        </label>
        <label>
          <span>Why was it necessary?</span>
          <textarea
            value={value.businessReason}
            onChange={(event) => update("businessReason", event.target.value)}
            placeholder="For example, authorised duty in London"
            rows={2}
          />
        </label>
        <label>
          <span>Trip</span>
          <select
            value={value.tripId}
            onChange={(event) => update("tripId", event.target.value)}
          >
            <option value="">No linked trip</option>
            {data.trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Meal context</span>
          <select
            value={value.mealContext}
            onChange={(event) =>
              update("mealContext", event.target.value as MealContext)
            }
          >
            <option value="">Not labelled</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Evening meal</option>
            <option value="snack">Snack</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
      </div>
    </details>
  );
}
