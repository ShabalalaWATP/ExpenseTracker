import type { TripVoiceDraft } from "@/src/domain/trip-voice";
import { countryName, daysBetween, formatDate } from "./format";

export function TripVoiceDraftSummary({
  draft,
}: {
  draft: TripVoiceDraft;
}) {
  const dateSummary =
    draft.startDate && draft.endDate
      ? `${formatDate(draft.startDate)} to ${formatDate(draft.endDate)}`
      : "Not yet provided";
  const eligibilitySummary = draft.eligibleDates?.length
    ? `${draft.eligibleDates.length} of ${
        draft.startDate && draft.endDate
          ? daysBetween(draft.startDate, draft.endDate).length
          : draft.eligibleDates.length
      } dates`
    : "Not yet confirmed";

  return (
    <dl className="trip-voice-draft" aria-label="Trip draft">
      <div><dt>Title</dt><dd>{draft.title ?? "Not yet provided"}</dd></div>
      <div><dt>Dates</dt><dd>{dateSummary}</dd></div>
      <div><dt>Eligibility</dt><dd>{eligibilitySummary}</dd></div>
      <div className="trip-voice-itinerary">
        <dt>Itinerary</dt>
        <dd>
          {draft.legs?.length ? (
            <ol>
              {draft.legs.map((leg, index) => (
                <li key={`${leg.countryCode}-${leg.location}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{leg.location}, {countryName(leg.countryCode)}</strong>
                  <small>
                    {formatDate(leg.startDate)} to {formatDate(leg.endDate)}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            "Not yet provided"
          )}
        </dd>
      </div>
    </dl>
  );
}
