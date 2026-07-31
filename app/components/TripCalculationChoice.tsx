import { canAggregateTrip } from "@/src/domain/trip-calculation";
import type { TripDraft, TripLeg } from "./types";

export function TripCalculationChoice({
  startDate,
  endDate,
  legs,
  eligibleDates,
  value,
  onChange,
}: {
  startDate: string;
  endDate: string;
  legs: TripLeg[];
  eligibleDates: string[];
  value: TripDraft["calculationMethod"];
  onChange: (value: TripDraft["calculationMethod"]) => void;
}) {
  const aggregationAvailable = canAggregateTrip(
    startDate,
    endDate,
    legs.map((leg) => leg.countryCode),
  );
  const pooledDayCount = eligibleDates.length;

  return (
    <fieldset className="aggregation-choice">
      <legend>How to apply the £30 food limit</legend>
      <p>
        Choose daily limits, or pool the allowance across a qualifying trip.
        This changes the calculation, not the receipts.
      </p>
      <label>
        <input
          type="radio"
          name="calculation-method"
          value="daily"
          checked={value === "daily"}
          onChange={() => onChange("daily")}
        />
        <span>
          <strong>Apply £30 each day</strong>
          <small>Each eligible day is capped separately.</small>
        </span>
      </label>
      <label className={!aggregationAvailable ? "disabled" : ""}>
        <input
          type="radio"
          name="calculation-method"
          value="aggregate"
          checked={value === "aggregate"}
          disabled={!aggregationAvailable}
          onChange={() => onChange("aggregate")}
        />
        <span>
          <strong>Pool the trip allowance</strong>
          <small>
            {aggregationAvailable
              ? pooledDayCount
                ? `${pooledDayCount} selected eligible ${
                    pooledDayCount === 1 ? "day" : "days"
                  } can share up to ${pooledDayCount} × £30.`
                : "Select the eligible dates to calculate the pooled limit."
              : "Available for UK trips of at least two nights."}
          </small>
        </span>
      </label>
    </fieldset>
  );
}
