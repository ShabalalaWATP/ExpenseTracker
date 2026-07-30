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

export type AutomaticTripLegCandidate = {
  tripId: string;
  tripLegId: string;
  ownerId: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  eligible: boolean;
  confirmed: boolean;
};

export type AutomaticTripLegLinkResolution =
  | {
      status: "explicit" | "matched";
      tripId: string;
      tripLegId: string;
    }
  | { status: "explicit"; tripId: null; tripLegId: null }
  | { status: "none"; tripId: null; tripLegId: null }
  | {
      status: "ambiguous";
      tripId: null;
      tripLegId: null;
      candidateTripIds: string[];
      candidateTripLegIds: string[];
    }
  | {
      status: "leg_ambiguous";
      tripId: string;
      tripLegId: null;
      candidateTripLegIds: string[];
    }
  | {
      status: "country_conflict";
      tripId: string | null;
      tripLegId: null;
      candidateCountryCodes: string[];
      candidateTripLegIds: string[];
    }
  | {
      status: "invalid";
      tripId: string | null;
      tripLegId: string | null;
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

export function eligibleTripLegsOnDate(
  candidates: readonly AutomaticTripLegCandidate[],
  ownerId: string,
  serviceDate: string,
): AutomaticTripLegCandidate[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.ownerId === ownerId &&
        candidate.startDate <= serviceDate &&
        candidate.endDate >= serviceDate &&
        candidate.eligible &&
        candidate.confirmed,
    )
    .sort(
      (left, right) =>
        left.tripId.localeCompare(right.tripId) ||
        left.tripLegId.localeCompare(right.tripLegId),
    );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function decideAutomaticTripLegLink(
  input: {
    ownerId: string;
    serviceDate: string;
    originalCountry: string | null;
    tripId: string | null;
    tripLegId: string | null;
    explicitlySelected: boolean;
  },
  allCandidates: readonly AutomaticTripLegCandidate[],
): AutomaticTripLegLinkResolution {
  if (input.explicitlySelected && !input.tripId) {
    return { status: "explicit", tripId: null, tripLegId: null };
  }
  if (input.explicitlySelected && input.tripId && input.tripLegId) {
    const exact = eligibleTripLegsOnDate(
      allCandidates,
      input.ownerId,
      input.serviceDate,
    ).find(
      (candidate) =>
        candidate.tripId === input.tripId &&
        candidate.tripLegId === input.tripLegId &&
        (!input.originalCountry ||
          candidate.countryCode === input.originalCountry),
    );
    return exact
      ? {
          status: "explicit",
          tripId: exact.tripId,
          tripLegId: exact.tripLegId,
        }
      : {
          status: "invalid",
          tripId: input.tripId,
          tripLegId: input.tripLegId,
        };
  }
  let candidates = eligibleTripLegsOnDate(
    allCandidates,
    input.ownerId,
    input.serviceDate,
  );
  if (input.explicitlySelected && input.tripId) {
    candidates = candidates.filter(
      (candidate) => candidate.tripId === input.tripId,
    );
  }
  if (input.originalCountry && candidates.length) {
    const matchingCountry = candidates.filter(
      (candidate) => candidate.countryCode === input.originalCountry,
    );
    if (!matchingCountry.length) {
      return {
        status: "country_conflict",
        tripId: input.explicitlySelected ? input.tripId : null,
        tripLegId: null,
        candidateCountryCodes: unique(
          candidates.map((candidate) => candidate.countryCode),
        ),
        candidateTripLegIds: unique(
          candidates.map((candidate) => candidate.tripLegId),
        ),
      };
    }
    candidates = matchingCountry;
  }
  if (!candidates.length) {
    return input.explicitlySelected
      ? { status: "invalid", tripId: input.tripId, tripLegId: null }
      : { status: "none", tripId: null, tripLegId: null };
  }
  if (candidates.length === 1) {
    return {
      status: input.explicitlySelected ? "explicit" : "matched",
      tripId: candidates[0].tripId,
      tripLegId: candidates[0].tripLegId,
    };
  }
  const tripIds = unique(candidates.map((candidate) => candidate.tripId));
  const tripLegIds = unique(
    candidates.map((candidate) => candidate.tripLegId),
  );
  if (tripIds.length > 1) {
    return {
      status: "ambiguous",
      tripId: null,
      tripLegId: null,
      candidateTripIds: tripIds,
      candidateTripLegIds: tripLegIds,
    };
  }
  return {
    status: "leg_ambiguous",
    tripId: tripIds[0],
    tripLegId: null,
    candidateTripLegIds: tripLegIds,
  };
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
