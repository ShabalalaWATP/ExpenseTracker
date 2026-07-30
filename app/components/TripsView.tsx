"use client";

import { useRef, useState, type FormEvent } from "react";
import { createTrip, updateTrip } from "./tripApi";
import {
  TripVoiceCreator,
  type TripVoiceCreatorHandle,
} from "./TripVoiceCreator";
import { TripRecords } from "./TripRecords";
import { daysBetween, formatDate } from "./format";
import { TripLegEditor } from "./TripLegEditor";
import { automaticTripCalculationMethod } from "@/src/domain/trip-calculation";
import { cleanTripDraft, validateTripDraft } from "./tripDraft";
import type { DashboardData, TripDraft, TripLeg } from "./types";
import { Field, StatusMessage, ViewHeader } from "./ui";

function newTripDraft(): TripDraft {
  return {
    title: "",
    location: "",
    country: "GB",
    startDate: "",
    endDate: "",
    legs: [{
      sequence: 0,
      countryCode: "GB",
      location: "",
      startDate: "",
      endDate: "",
    }],
    eligibleDates: [],
    attested: false,
    calculationMethod: "daily",
  };
}

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
  const voiceRef = useRef<TripVoiceCreatorHandle>(null);
  const [creating, setCreating] = useState(
    Boolean(initialStartDate) || Boolean(initialTrip),
  );
  const [editingId, setEditingId] = useState(initialTrip?.id ?? "");
  const [title, setTitle] = useState(initialTrip?.title ?? "");
  const [startDate, setStartDate] = useState(initialStartDate ?? initialTrip?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? initialStartDate ?? initialTrip?.endDate ?? "");
  const [legs, setLegs] = useState<TripLeg[]>(
    initialTrip?.legs?.length
      ? initialTrip.legs
      : [
          {
            sequence: 0,
            countryCode: "GB",
            location: initialTrip?.location ?? "",
            startDate: initialStartDate ?? initialTrip?.startDate ?? "",
            endDate:
              initialEndDate ??
              initialStartDate ??
              initialTrip?.endDate ??
              "",
          },
        ],
  );
  const [eligibleDates, setEligibleDates] = useState<string[]>(
    initialTrip?.eligibleDates ??
    (initialStartDate
      ? daysBetween(initialStartDate, initialEndDate ?? initialStartDate)
      : []),
  );
  const [attested, setAttested] = useState(Boolean(initialTrip?.attested));
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

  function updateLegs(nextLegs: TripLeg[]) {
    const ordered = nextLegs.map((leg, sequence) => ({ ...leg, sequence }));
    const nextStart = ordered[0]?.startDate ?? "";
    const nextEnd = ordered.at(-1)?.endDate ?? "";
    setLegs(ordered);
    if (nextStart !== startDate || nextEnd !== endDate) {
      setStartDate(nextStart);
      setEndDate(nextEnd);
      syncDates(nextStart, nextEnd);
    }
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
    voiceRef.current?.stop();
    setEditingId(trip.id);
    setTitle(trip.title);
    setLegs(trip.legs);
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setEligibleDates(trip.eligibleDates ?? []);
    setAttested(Boolean(trip.attested));
    setManualOpen(true);
    setCreating(true);
  }

  function resetNewTrip(draft = newTripDraft()) {
    setEditingId("");
    setTitle(draft.title);
    setLegs(draft.legs);
    setStartDate(draft.startDate);
    setEndDate(draft.endDate);
    setEligibleDates(draft.eligibleDates);
    setAttested(draft.attested);
    setManualOpen(false);
    setError("");
    setCreating(false);
    return draft;
  }

  function startVoiceTrip() {
    const draft = resetNewTrip();
    void voiceRef.current?.start(draft);
  }

  function openManualTrip() {
    voiceRef.current?.stop();
    setManualOpen(true);
    setCreating(true);
  }

  function closeForm() {
    setCreating(false);
    setEditingId("");
    setManualOpen(false);
    setError("");
  }

  function applyDraft(draft: TripDraft) {
    setTitle(draft.title);
    setLegs(draft.legs);
    setStartDate(draft.startDate);
    setEndDate(draft.endDate);
    setEligibleDates(draft.eligibleDates);
    setAttested(draft.attested);
  }

  async function persistDraft(draft: TripDraft) {
    const issue = validateTripDraft(draft);
    if (issue) throw new Error(issue);
    setSaving(true);
    try {
      const cleanDraft = cleanTripDraft(draft);
      if (editingId) await updateTrip(editingId, cleanDraft);
      else await createTrip(cleanDraft);
      await onChanged();
      setCreating(false);
      setTitle("");
      setLegs([]);
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
        location: legs.map((leg) => leg.location).join(", "),
        country: legs[0]?.countryCode ?? "",
        startDate,
        endDate,
        legs,
        eligibleDates,
        attested,
        calculationMethod: automaticTripCalculationMethod(startDate, endDate),
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
        detail="Start a live voice conversation, or type the itinerary yourself."
        action={
          <button
            className="primary-button"
            type="button"
            onClick={startVoiceTrip}
          >
            Create a trip
          </button>
        }
      />

      <div className="trips-layout">
        <section className="trip-create-area" aria-labelledby="trip-create-heading">
          <div className="section-heading trip-create-title">
            <div>
              <p className="eyebrow">New trip</p>
              <h2 id="trip-create-heading">
                {creating ? "Type the trip details" : "Talk it through"}
              </h2>
            </div>
            <small>
              {creating
                ? "Every field remains editable before saving."
                : "The assistant asks for each detail and speaks its questions aloud."}
            </small>
          </div>
          <div hidden={creating}>
            <TripVoiceCreator
              ref={voiceRef}
              draft={{
                title,
                location: legs.map((leg) => leg.location).join(", "),
                country: legs[0]?.countryCode ?? "",
                startDate,
                endDate,
                legs,
                eligibleDates,
                attested,
                calculationMethod: automaticTripCalculationMethod(
                  startDate,
                  endDate,
                ),
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
              onManual={openManualTrip}
            />
          </div>
          {creating ? (
          <section className="trip-form-panel" aria-labelledby="trip-form-heading">
            <div className="editor-top">
              <div><p className="eyebrow">{editingId ? "Update duty period" : "New duty period"}</p><h2 id="trip-form-heading">{editingId || manualOpen ? "Trip details" : "Tell us about the trip"}</h2></div>
              <button className="round-button" type="button" onClick={closeForm} aria-label="Close trip form">×</button>
            </div>
            <form onSubmit={save}>
              {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
              <Field label="Trip title" required><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="For example, European training visit" /></Field>
              <TripLegEditor legs={legs} onChange={updateLegs} />
              {dates.length ? (
                <fieldset className="date-checks">
                  <legend>Eligible Day Subsistence dates</legend>
                  <p>Untick dates that are not eligible.</p>
                  <div>{dates.map((date) => <label key={date}><input type="checkbox" checked={eligibleDates.includes(date)} onChange={() => toggleDate(date)} /><span>{formatDate(date)}</span></label>)}</div>
                </fieldset>
              ) : null}
              <label className="attestation">
                <input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} />
                <span><strong>I confirm these eligible dates</strong><small>The absence exceeded five hours, arose from authorised duty, and equivalent food was not provided at public expense.</small></span>
              </label>
              <div className="form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving trip…" : editingId ? "Update trip" : "Save trip"}</button></div>
            </form>
          </section>
          ) : null}
        </section>

        <TripRecords trips={data.trips} onEdit={editTrip} />
      </div>
    </div>
  );
}
