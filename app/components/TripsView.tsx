"use client";

import { useState, type FormEvent } from "react";
import { createTrip } from "./api";
import { daysBetween, formatDate } from "./format";
import type { DashboardData } from "./types";
import { EmptyState, Field, StatusMessage, ViewHeader } from "./ui";

export function TripsView({
  data,
  onChanged,
}: {
  data: DashboardData;
  onChanged: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(data.trips.length === 0);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [eligibleDates, setEligibleDates] = useState<string[]>([]);
  const [attested, setAttested] = useState(false);
  const [method, setMethod] = useState<"daily" | "aggregate">("daily");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dates = startDate && endDate && endDate >= startDate
    ? daysBetween(startDate, endDate)
    : [];

  function syncDates(nextStart: string, nextEnd: string) {
    setEligibleDates(
      nextStart && nextEnd && nextEnd >= nextStart
        ? daysBetween(nextStart, nextEnd)
        : [],
    );
    setAttested(false);
  }

  function toggleDate(date: string) {
    setEligibleDates((current) =>
      current.includes(date)
        ? current.filter((item) => item !== date)
        : [...current, date].sort(),
    );
    setAttested(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !location.trim() || !startDate || !endDate || endDate < startDate) {
      setError("Enter a title, UK location and valid date range.");
      return;
    }
    if (!eligibleDates.length || !attested) {
      setError("Confirm at least one eligible date and complete the eligibility attestation.");
      return;
    }
    if (method === "aggregate" && dates.length < 3) {
      setError("Aggregation requires two nights or more. Choose the daily method for this trip.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createTrip({
        title: title.trim(),
        location: location.trim(),
        country: "GB",
        startDate,
        endDate,
        eligibleDates,
        attested,
        calculationMethod: method,
      });
      await onChanged();
      setCreating(false);
      setTitle("");
      setLocation("");
      setStartDate("");
      setEndDate("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trip could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow={`${data.trips.length} ${data.trips.length === 1 ? "trip" : "trips"}`}
        title="Trips"
        detail="Group detached duty dates and confirm how the allowance is calculated."
        action={!creating ? <button className="primary-button" type="button" onClick={() => setCreating(true)}>New trip</button> : undefined}
      />

      <div className={`trips-layout ${creating ? "with-form" : ""}`}>
        <section aria-labelledby="trip-list-heading">
          <div className="section-heading">
            <div><p className="eyebrow">Duty periods</p><h2 id="trip-list-heading">Recorded trips</h2></div>
          </div>
          {data.trips.length ? (
            <ul className="trip-list">
              {data.trips.map((trip) => (
                <li key={trip.id}>
                  <div className="trip-dates" aria-hidden="true">
                    <strong>{trip.startDate.slice(8, 10)}</strong>
                    <span>to</span>
                    <strong>{trip.endDate.slice(8, 10)}</strong>
                  </div>
                  <div className="trip-main">
                    <strong>{trip.title}</strong>
                    <span>{trip.location} · {trip.country}</span>
                    <small>{formatDate(trip.startDate)} to {formatDate(trip.endDate)}</small>
                  </div>
                  <div className="trip-state">
                    <span className={`state-label ${trip.attested ? "success" : "warning"}`}>{trip.attested ? "Dates confirmed" : "Needs confirmation"}</span>
                    <small>{trip.calculationMethod === "aggregate" ? "Aggregate method" : "Daily method"}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No duty periods recorded" action={<button className="primary-button" type="button" onClick={() => setCreating(true)}>Create a trip</button>}>
              Trips make repeated location, purpose and eligible dates easier to confirm.
            </EmptyState>
          )}
        </section>

        {creating ? (
          <section className="trip-form-panel" aria-labelledby="trip-form-heading">
            <div className="editor-top">
              <div><p className="eyebrow">New duty period</p><h2 id="trip-form-heading">Trip details</h2></div>
              {data.trips.length ? <button className="round-button" type="button" onClick={() => setCreating(false)} aria-label="Close trip form">×</button> : null}
            </div>
            <form onSubmit={save}>
              {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
              <Field label="Trip title" required><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For example, London training" /></Field>
              <Field label="Location" required><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Town or duty station" /></Field>
              <Field label="Country" required><input value="United Kingdom (GB)" readOnly /></Field>
              <div className="two-fields">
                <Field label="Start date" required><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); syncDates(event.target.value, endDate); }} /></Field>
                <Field label="End date" required><input type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); syncDates(startDate, event.target.value); }} /></Field>
              </div>
              {dates.length ? (
                <fieldset className="date-checks">
                  <legend>Eligible Day Subsistence dates</legend>
                  <p>Untick dates that are not eligible.</p>
                  <div>{dates.map((date) => <label key={date}><input type="checkbox" checked={eligibleDates.includes(date)} onChange={() => toggleDate(date)} /><span>{formatDate(date)}</span></label>)}</div>
                </fieldset>
              ) : null}
              <fieldset className="method-choice">
                <legend>Calculation method</legend>
                <label><input type="radio" name="method" value="daily" checked={method === "daily"} onChange={() => setMethod("daily")} /><span><strong>Daily</strong><small>Apply the £30 limit separately to each eligible date.</small></span></label>
                <label><input type="radio" name="method" value="aggregate" checked={method === "aggregate"} onChange={() => setMethod("aggregate")} /><span><strong>Aggregate</strong><small>Pool actual spend over two nights or more.</small></span></label>
              </fieldset>
              <label className="attestation">
                <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
                <span><strong>I confirm these eligible dates</strong><small>The absence exceeded five hours, arose from authorised duty, and equivalent food was not provided at public expense.</small></span>
              </label>
              <div className="form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving trip…" : "Save trip"}</button></div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}
