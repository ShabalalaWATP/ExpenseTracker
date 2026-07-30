"use client";

import {
  type DashboardData,
} from "../types";
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
    <section className="intake-defaults" aria-labelledby="intake-context-heading">
      <div className="intake-default-heading">
        <span>
          <strong id="intake-context-heading">Optional context</strong>
          <small>
            Date, place, category and meal context are read from each receipt
          </small>
        </span>
      </div>
      <div className="intake-default-fields">
        <label>
          <span>Additional justification</span>
          <textarea
            value={value.businessReason}
            onChange={(event) => update("businessReason", event.target.value)}
            placeholder="Optional short note, for example the duty or event"
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
      </div>
    </section>
  );
}
