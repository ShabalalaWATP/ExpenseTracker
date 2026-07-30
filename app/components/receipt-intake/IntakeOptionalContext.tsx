"use client";

import type { DashboardData } from "../types";

export function IntakeOptionalContext({
  data,
  reason,
  tripId,
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
  tripId: string;
  tripMatchStatus: "none" | "automatic" | "explicit" | "ambiguous";
  tripMatchException: string | null;
  tripDecision: "unchanged" | "selected" | "leave_unlinked";
  locked: boolean;
  reasonFlagged: boolean;
  reasonConfidence: string;
  canReanalyse: boolean;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onTripChange: (value: string) => void;
  onLeaveTripUnlinked: () => void;
  onReasonRecheck: () => void;
}) {
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
        <span>Trip (optional)</span>
        <select
          value={tripId}
          onChange={(event) => onTripChange(event.target.value)}
          disabled={locked}
        >
          <option value="">
            {tripMatchStatus === "ambiguous" &&
            tripDecision !== "leave_unlinked"
              ? "Choose a trip"
              : "No linked trip"}
          </option>
          {data.trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.title}
            </option>
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
