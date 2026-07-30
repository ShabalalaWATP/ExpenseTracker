export type TripReviewInput = {
  tripId?: string | null;
  leaveTripUnlinked?: boolean;
};

export type TripReviewDecision = {
  tripId: string | null;
  explicitlySelected: boolean;
};

/**
 * Distinguishes an owner's trip decision from a form that routinely serialises
 * an unchanged null. A null only becomes authoritative when the owner uses the
 * dedicated leave-unlinked action.
 */
export function decideTripReview(
  existingTripId: string | null,
  input: TripReviewInput,
): TripReviewDecision {
  if (input.leaveTripUnlinked === true) {
    return { tripId: null, explicitlySelected: true };
  }
  if (
    typeof input.tripId === "string" &&
    input.tripId.length > 0 &&
    input.tripId !== existingTripId
  ) {
    return { tripId: input.tripId, explicitlySelected: true };
  }
  return { tripId: existingTripId, explicitlySelected: false };
}
