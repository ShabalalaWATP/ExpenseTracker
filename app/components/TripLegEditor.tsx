import { countryName, formatDate } from "./format";
import type { TripLeg } from "./types";

export function TripLegEditor({
  legs,
  onChange,
}: {
  legs: TripLeg[];
  onChange: (legs: TripLeg[]) => void;
}) {
  function update(index: number, changes: Partial<TripLeg>) {
    onChange(
      legs.map((leg, legIndex) =>
        legIndex === index ? { ...leg, ...changes } : leg,
      ),
    );
  }

  function move(index: number, offset: -1 | 1) {
    const destination = index + offset;
    if (destination < 0 || destination >= legs.length) return;
    const reordered = [...legs];
    [reordered[index], reordered[destination]] = [
      reordered[destination],
      reordered[index],
    ];
    onChange(
      reordered.map((leg, sequence) => ({
        ...leg,
        sequence,
      })),
    );
  }

  function remove(index: number) {
    if (legs.length === 1) return;
    onChange(
      legs
        .filter((_, legIndex) => legIndex !== index)
        .map((leg, sequence) => ({ ...leg, sequence })),
    );
  }

  function add() {
    const previous = legs.at(-1);
    onChange([
      ...legs,
      {
        sequence: legs.length,
        countryCode: previous?.countryCode ?? "",
        location: "",
        startDate: previous?.endDate ?? "",
        endDate: previous?.endDate ?? "",
      },
    ]);
  }

  return (
    <fieldset className="itinerary-editor">
      <legend>Itinerary</legend>
      <p>
        Add each country or duty location in travel order. Receipt matching
        uses the leg dates and country.
      </p>
      <ol>
        {legs.map((leg, index) => {
          const code = leg.countryCode.trim().toUpperCase();
          return (
            <li key={leg.id ?? `new-leg-${index}`}>
              <div className="itinerary-leg-heading">
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>
                    {code.length === 2
                      ? countryName(code)
                      : `Itinerary leg ${index + 1}`}
                  </strong>
                  <small>
                    {leg.startDate && leg.endDate
                      ? `${formatDate(leg.startDate)} to ${formatDate(leg.endDate)}`
                      : "Dates not complete"}
                  </small>
                </div>
                <div className="itinerary-order" aria-label={`Reorder leg ${index + 1}`}>
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move leg ${index + 1} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === legs.length - 1}
                    aria-label={`Move leg ${index + 1} later`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    disabled={legs.length === 1}
                    aria-label={`Remove leg ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="itinerary-leg-fields">
                <label>
                  <span>Country code</span>
                  <input
                    value={leg.countryCode}
                    onChange={(event) =>
                      update(index, {
                        countryCode: event.target.value
                          .replace(/[^a-z]/gi, "")
                          .slice(0, 2)
                          .toUpperCase(),
                      })
                    }
                    placeholder="FR"
                    autoCapitalize="characters"
                    autoComplete="country"
                    inputMode="text"
                    pattern="[A-Za-z]{2}"
                    maxLength={2}
                    required
                  />
                  <small>
                    {code.length === 2
                      ? countryName(code)
                      : "Use the two-letter country code"}
                  </small>
                </label>
                <label>
                  <span>Location</span>
                  <input
                    value={leg.location}
                    onChange={(event) =>
                      update(index, { location: event.target.value })
                    }
                    placeholder="City or duty station"
                    required
                  />
                </label>
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={leg.startDate}
                    min={index > 0 ? legs[index - 1].startDate : undefined}
                    onChange={(event) =>
                      update(index, {
                        startDate: event.target.value,
                        endDate:
                          !leg.endDate || leg.endDate < event.target.value
                            ? event.target.value
                            : leg.endDate,
                      })
                    }
                    required
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    min={leg.startDate}
                    value={leg.endDate}
                    onChange={(event) =>
                      update(index, { endDate: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      <button className="secondary-button itinerary-add" type="button" onClick={add}>
        Add another leg
      </button>
    </fieldset>
  );
}
