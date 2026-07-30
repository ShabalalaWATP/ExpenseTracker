import { countryName, formatDate } from "./format";
import type { Trip } from "./types";
import { EmptyState } from "./ui";

export function TripRecords({
  trips,
  onEdit,
}: {
  trips: Trip[];
  onEdit: (id: string) => void;
}) {
  return (
    <section className="trip-records" aria-labelledby="trip-list-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your itinerary history</p>
          <h2 id="trip-list-heading">Recorded trips</h2>
        </div>
        <small>Claims during an eligible active trip link automatically.</small>
      </div>
      {trips.length ? (
        <ul className="trip-list">
          {trips.map((trip) => (
            <li key={trip.id}>
              <div className="trip-dates" aria-hidden="true">
                <strong>{trip.startDate.slice(8, 10)}</strong>
                <span>to</span>
                <strong>{trip.endDate.slice(8, 10)}</strong>
              </div>
              <div className="trip-main">
                <strong>{trip.title}</strong>
                <span>
                  {trip.legs
                    .map(
                      (leg) =>
                        `${leg.location}, ${countryName(leg.countryCode)}`,
                    )
                    .join(" → ")}
                </span>
                <small>
                  {formatDate(trip.startDate)} to {formatDate(trip.endDate)}
                </small>
              </div>
              <div className="trip-state">
                <span
                  className={`state-label ${
                    trip.attested ? "success" : "warning"
                  }`}
                >
                  {trip.attested ? "Dates confirmed" : "Needs confirmation"}
                </span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onEdit(trip.id)}
                >
                  Edit trip
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No trips recorded yet">
          Use Create a trip for a live voice conversation, or choose Type
          instead in the assistant.
        </EmptyState>
      )}
    </section>
  );
}
