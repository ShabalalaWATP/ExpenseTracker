export type AutomaticTripLinkResolution =
  | { status: "explicit"; tripId: string | null }
  | { status: "matched"; tripId: string }
  | { status: "none"; tripId: null }
  | {
      status: "ambiguous";
      tripId: null;
      candidateTripIds: string[];
    };

export type AutomaticTripCandidate = {
  id: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  eligible: boolean;
  confirmed: boolean;
};

export function isExplicitTripSelectionChange(
  existingTripId: string | null,
  suppliedTripId: string | null | undefined,
): boolean {
  return suppliedTripId !== undefined && suppliedTripId !== existingTripId;
}

export function eligibleTripIdsOnDate(
  candidates: readonly AutomaticTripCandidate[],
  ownerId: string,
  serviceDate: string,
): string[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.ownerId === ownerId &&
        candidate.startDate <= serviceDate &&
        candidate.endDate >= serviceDate &&
        candidate.eligible &&
        candidate.confirmed,
    )
    .map((candidate) => candidate.id)
    .sort();
}

export function decideAutomaticTripLink(
  input: {
    tripId: string | null;
    explicitlySelected: boolean;
  },
  candidateTripIds: readonly string[],
): AutomaticTripLinkResolution {
  if (input.explicitlySelected) {
    return { status: "explicit", tripId: input.tripId };
  }
  const uniqueIds = [...new Set(candidateTripIds)].sort();
  if (uniqueIds.length === 0) {
    return { status: "none", tripId: null };
  }
  if (uniqueIds.length === 1) {
    return { status: "matched", tripId: uniqueIds[0] };
  }
  return {
    status: "ambiguous",
    tripId: null,
    candidateTripIds: uniqueIds,
  };
}
