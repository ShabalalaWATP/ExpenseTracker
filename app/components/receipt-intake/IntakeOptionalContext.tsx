"use client";

import type { DashboardData } from "../types";
import { countryName, formatDate } from "../format";

export function IntakeOptionalContext({
  data,
  reason,
  tripLegId,
  serviceDate,
  originalCountry,
  tripMatchStatus,
  tripMatchException,
  tripDecision,
  locked,
  reasonFlagged,
  reasonConfidence,
  canReanalyse,
  busy,
  onReasonChange,
  onTripChange,
  onLeaveTripUnlinked,
  onReasonRecheck,
}: {
  data: DashboardData;
  reason: string;
  tripLegId: string;
  serviceDate: string;
  originalCountry?: string;
  tripMatchStatus: "none" | "automatic" | "explicit" | "ambiguous";
  tripMatchException: string | null;
  tripDecision: "unchanged" | "selected" | "leave_unlinked";
  locked: boolean;
  reasonFlagged: boolean;
  reasonConfidence: string;
  canReanalyse: boolean;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onTripChange: (tripId: string, tripLegId: string) => void;
  onLeaveTripUnlinked: () => void;
  onReasonRecheck: () => void;
}) {
  const eligibleTrips = data.trips
    .map((trip) => ({
      ...trip,
      legs: trip.legs.filter(
        (leg) =>
          Boolean(leg.id) &&
          Boolean(serviceDate) &&
          trip.attested === true &&
          trip.eligibleDates?.includes(serviceDate) &&
          serviceDate >= leg.startDate &&
          serviceDate <= leg.endDate &&
          (!originalCountry ||
            originalCountry === "UNKNOWN" ||
            leg.countryCode === originalCountry),
      ),
    }))
    .filter((trip) => trip.legs.length > 0);
  return (
    <div className="intake-field-grid">
      <label className={`wide ${reasonFlagged ? "flagged" : ""}`}>
        <span>
          Justification <small>{reasonConfidence}</small>
          {canReanalyse ? (
            <button
              type="button"
              className="field-reread"
              disabled={busy}
              onClick={onReasonRecheck}
            >
              Recheck
            </button>
          ) : null}
        </span>
        <textarea
          data-intake-review-field="businessReason"
          rows={2}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          disabled={locked}
          placeholder="Add a short note only if the receipt suggestion needs context"
        />
      </label>
      <label>
        <span>Trip and itinerary stop (optional)</span>
        <select
          value={tripLegId}
          onChange={(event) => {
            const legId = event.target.value;
            const trip = eligibleTrips.find((candidate) =>
              candidate.legs.some((leg) => leg.id === legId),
            );
            onTripChange(trip?.id ?? "", legId);
          }}
          disabled={locked}
        >
          <option value="">
            {tripMatchStatus === "ambiguous" &&
            tripDecision !== "leave_unlinked"
              ? "Choose a trip"
              : "No linked trip"}
          </option>
          {eligibleTrips.map((trip) => (
            <optgroup key={trip.id} label={trip.title}>
              {trip.legs.map((leg) => (
                <option key={leg.id} value={leg.id}>
                  {leg.location} · {countryName(leg.countryCode)} ·{" "}
                  {formatDate(leg.startDate)} to {formatDate(leg.endDate)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {tripMatchStatus === "ambiguous" ? (
        <div className="wide review-message" role="alert">
          <p>
            {tripMatchException ||
              "This receipt matches more than one trip. Choose the correct trip or leave it unlinked."}
          </p>
          <button
            type="button"
            className="secondary"
            disabled={locked || busy || tripDecision === "leave_unlinked"}
            onClick={onLeaveTripUnlinked}
          >
            {tripDecision === "leave_unlinked"
              ? "Will be left unlinked"
              : "Leave unlinked"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
