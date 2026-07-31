import { canAggregateTrip } from "@/src/domain/trip-calculation";
import { ApiError } from "./http";

export function resolveAggregateElection(
  requested: boolean | undefined,
  startDate: string,
  endDate: string,
  countryCodes: readonly string[],
): boolean {
  if (!requested) return false;
  if (canAggregateTrip(startDate, endDate, countryCodes)) return true;
  throw new ApiError(
    400,
    "aggregation_invalid",
    "This £30 aggregation needs a UK absence of at least two nights.",
  );
}
