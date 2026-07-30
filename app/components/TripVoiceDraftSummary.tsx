import type { TripVoiceDraft } from "@/src/domain/trip-voice";
import { daysBetween, formatDate } from "./format";

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
      <div><dt>Location</dt><dd>{draft.location ?? "Not yet provided"}</dd></div>
      <div><dt>Country</dt><dd>{draft.country === "GB" ? "United Kingdom" : "Not yet provided"}</dd></div>
      <div><dt>Dates</dt><dd>{dateSummary}</dd></div>
      <div><dt>Method</dt><dd>{draft.calculationMethod ?? "Not yet provided"}</dd></div>
      <div><dt>Eligibility</dt><dd>{eligibilitySummary}</dd></div>
    </dl>
  );
}
