"use client";

import { useState, type FormEvent } from "react";
import { createTrip, updateTrip } from "./tripApi";
import { TripVoiceCreator } from "./TripVoiceCreator";
import { daysBetween, formatDate } from "./format";
import type { DashboardData } from "./types";
import { EmptyState, Field, StatusMessage, ViewHeader } from "./ui";

export function TripsView({
  data,
  initialTripId,
  initialStartDate,
  initialEndDate,
  onChanged,
}: {
  data: DashboardData;
  initialTripId?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  onChanged: () => Promise<void>;
}) {
  const initialTrip = data.trips.find((trip) => trip.id === initialTripId);
  const [creating, setCreating] = useState(
    data.trips.length === 0 || Boolean(initialStartDate) || Boolean(initialTrip),
  );
  const [editingId, setEditingId] = useState(initialTrip?.id ?? "");
  const [title, setTitle] = useState(initialTrip?.title ?? "");
  const [location, setLocation] = useState(initialTrip?.location ?? "");
  const [startDate, setStartDate] = useState(initialStartDate ?? initialTrip?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? initialStartDate ?? initialTrip?.endDate ?? "");
  const [eligibleDates, setEligibleDates] = useState<string[]>(
    initialTrip?.eligibleDates ??
    (initialStartDate
      ? daysBetween(initialStartDate, initialEndDate ?? initialStartDate)
      : []),
  );
  const [attested, setAttested] = useState(Boolean(initialTrip?.attested));
  const [method, setMethod] = useState<"daily" | "aggregate">(
    initialTrip?.calculationMethod ?? "daily",
  );
  const [manualOpen, setManualOpen] = useState(
    Boolean(initialTrip || initialStartDate),
  );
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

  function editTrip(id: string) {
    const trip = data.trips.find((item) => item.id === id);
    if (!trip) return;
    setEditingId(trip.id);
    setTitle(trip.title);
    setLocation(trip.location);
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setEligibleDates(trip.eligibleDates ?? []);
    setAttested(Boolean(trip.attested));
    setMethod(trip.calculationMethod ?? "daily");
    setManualOpen(true);
    setCreating(true);
  }

  function openNewTrip() {
    setEditingId("");
    setTitle("");
    setLocation("");
    setStartDate("");
    setEndDate("");
    setEligibleDates([]);
    setAttested(false);
    setMethod("daily");
    setManualOpen(false);
    setError("");
    setCreating(true);
  }

  function closeForm() {
    setCreating(false);
    setEditingId("");
    setError("");
  }

  function applyDraft(draft: {
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    eligibleDates: string[];
    attested: boolean;
    calculationMethod: "daily" | "aggregate";
  }) {
    setTitle(draft.title);
    setLocation(draft.location);
    setStartDate(draft.startDate);
    setEndDate(draft.endDate);
    setEligibleDates(draft.eligibleDates);
    setAttested(draft.attested);
    setMethod(draft.calculationMethod);
  }

  async function persistDraft(draft: {
    title: string;
    location: string;
    country: "GB";
    startDate: string;
    endDate: string;
    eligibleDates: string[];
    attested: boolean;
    calculationMethod: "daily" | "aggregate";
  }) {
    if (
      !draft.title.trim() ||
      !draft.location.trim() ||
      !draft.startDate ||
      !draft.endDate ||
      draft.endDate < draft.startDate
    ) {
      throw new Error("Enter a title, UK location and valid date range.");
    }
    if (!draft.eligibleDates.length || !draft.attested) {
      throw new Error(
        "Confirm at least one eligible date and complete the eligibility attestation.",
      );
    }
    const draftDates = daysBetween(draft.startDate, draft.endDate);
    if (
      draft.eligibleDates.some((date) => !draftDates.includes(date))
    ) {
      throw new Error("Every eligible date must fall within the trip.");
    }
    if (draft.calculationMethod === "aggregate" && draftDates.length < 3) {
      throw new Error(
        "Aggregation requires two nights or more. Choose the daily method for this trip.",
      );
    }
    setSaving(true);
    try {
      const cleanDraft = {
        ...draft,
        title: draft.title.trim(),
        location: draft.location.trim(),
      };
      if (editingId) await updateTrip(editingId, cleanDraft);
      else await createTrip(cleanDraft);
      await onChanged();
      setCreating(false);
      setTitle("");
      setLocation("");
      setStartDate("");
      setEndDate("");
      setEditingId("");
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await persistDraft({
        title,
        location,
        country: "GB",
        startDate,
        endDate,
        eligibleDates,
        attested,
        calculationMethod: method,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The trip could not be saved.",
      );
    }
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow={`${data.trips.length} ${data.trips.length === 1 ? "trip" : "trips"}`}
        title="Trips"
        detail="Group detached duty dates and confirm how the allowance is calculated."
        action={!creating ? <button className="primary-button" type="button" onClick={openNewTrip}>New trip</button> : undefined}
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
                    <button className="text-button" type="button" onClick={() => editTrip(trip.id)}>Edit trip</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No duty periods recorded" action={<button className="primary-button" type="button" onClick={openNewTrip}>Create a trip</button>}>
              Trips make repeated location, purpose and eligible dates easier to confirm.
            </EmptyState>
          )}
        </section>

        {creating ? (
          <section className="trip-form-panel" aria-labelledby="trip-form-heading">
            <div className="editor-top">
              <div><p className="eyebrow">{editingId ? "Update duty period" : "New duty period"}</p><h2 id="trip-form-heading">{editingId || manualOpen ? "Trip details" : "Tell us about the trip"}</h2></div>
              {data.trips.length ? <button className="round-button" type="button" onClick={closeForm} aria-label="Close trip form">×</button> : null}
            </div>
            {!editingId && !manualOpen ? (
              <TripVoiceCreator
                draft={{
                  title,
                  location,
                  country: "GB",
                  startDate,
                  endDate,
                  eligibleDates,
                  attested,
                  calculationMethod: method,
                }}
                onDraftChange={applyDraft}
                onConfirmedSave={async (draft) => {
                  setError("");
                  try {
                    await persistDraft(draft);
                  } catch (caught) {
                    const message =
                      caught instanceof Error
                        ? caught.message
                        : "The trip could not be saved.";
                    setError(message);
                    throw new Error(message);
                  }
                }}
                onManual={() => setManualOpen(true)}
              />
            ) : (
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
              <div className="form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving trip…" : editingId ? "Update trip" : "Save trip"}</button></div>
            </form>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
