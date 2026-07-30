import type { Principal } from "./principal";
import type { Provenance } from "./receipt-analysis-merge";
import {
  resolveAutomaticTripLink,
  type AutomaticTripLegLinkResolution,
} from "./trip-auto-link";

export const AMBIGUOUS_TRIP_MESSAGE =
  "This receipt date matches more than one confirmed eligible trip. Select the correct trip before confirming the expense.";
export const AMBIGUOUS_TRIP_LEG_MESSAGE =
  "This receipt matches more than one itinerary leg. Select the correct stop before confirming the expense.";
export const TRIP_COUNTRY_CONFLICT_MESSAGE =
  "The receipt country does not match an eligible itinerary leg on the service date. Check the country or select the correct stop.";
export const INVALID_TRIP_LEG_MESSAGE =
  "The selected itinerary leg is not valid for this receipt date.";

export type ReceiptTripLink = {
  resolution: AutomaticTripLegLinkResolution;
  tripId: string | null;
  tripLegId: string | null;
  provenance: Provenance;
  errorCode:
    | "receipt_trip_ambiguous"
    | "receipt_trip_leg_ambiguous"
    | "receipt_trip_country_conflict"
    | "receipt_trip_leg_invalid"
    | null;
  errorMessage: string | null;
};

export function applyResolvedTripAssignment(
  assignments: string[],
  values: unknown[],
  currentTripId: string | null,
  resolvedTripId: string | null,
): string | null {
  if (currentTripId === resolvedTripId) return currentTripId;
  const existingAssignment = assignments.indexOf("trip_id = ?");
  if (existingAssignment >= 0) {
    values[existingAssignment] = resolvedTripId;
  } else {
    assignments.push("trip_id = ?");
    values.push(resolvedTripId);
  }
  return resolvedTripId;
}

export function applyResolvedTripLegAssignment(
  assignments: string[],
  values: unknown[],
  currentTripLegId: string | null,
  resolvedTripLegId: string | null,
): string | null {
  if (currentTripLegId === resolvedTripLegId) return currentTripLegId;
  const existingAssignment = assignments.indexOf("trip_leg_id = ?");
  if (existingAssignment >= 0) {
    values[existingAssignment] = resolvedTripLegId;
  } else {
    assignments.push("trip_leg_id = ?");
    values.push(resolvedTripLegId);
  }
  return resolvedTripLegId;
}

export function tripRevisionFields(
  fields: string[],
  beforeTripId: string | null,
  afterTripId: string | null,
): string[] {
  return beforeTripId !== afterTripId && !fields.includes("tripId")
    ? [...fields, "tripId"]
    : fields;
}

export async function resolveReceiptTripLink(
  principal: Principal,
  input: {
    serviceDate: string | null;
    tripId: string | null;
    tripLegId?: string | null;
    originalCountry?: string | null;
    provenance: Provenance;
  },
): Promise<ReceiptTripLink> {
  const resolution = await resolveAutomaticTripLink(principal, {
    serviceDate: input.serviceDate,
    tripId: input.tripId,
    tripLegId: input.tripLegId,
    originalCountry: input.originalCountry,
    explicitlySelected: input.provenance.trip_id === "owner",
  });
  const provenance = { ...input.provenance };
  if (resolution.status === "matched") {
    provenance.trip_id = "auto";
    provenance.trip_leg_id = "auto";
  } else if (
    resolution.status === "explicit" &&
    resolution.tripLegId &&
    resolution.tripLegId !== input.tripLegId
  ) {
    provenance.trip_leg_id = "auto";
  } else if (resolution.status !== "explicit") {
    delete provenance.trip_id;
    delete provenance.trip_leg_id;
  }
  const errors = {
    ambiguous: {
      code: "receipt_trip_ambiguous",
      message: AMBIGUOUS_TRIP_MESSAGE,
    },
    leg_ambiguous: {
      code: "receipt_trip_leg_ambiguous",
      message: AMBIGUOUS_TRIP_LEG_MESSAGE,
    },
    country_conflict: {
      code: "receipt_trip_country_conflict",
      message: TRIP_COUNTRY_CONFLICT_MESSAGE,
    },
    invalid: {
      code: "receipt_trip_leg_invalid",
      message: INVALID_TRIP_LEG_MESSAGE,
    },
  } as const;
  const error = errors[resolution.status as
    | "ambiguous"
    | "leg_ambiguous"
    | "country_conflict"
    | "invalid"];
  return {
    resolution,
    tripId: resolution.tripId,
    tripLegId: resolution.tripLegId,
    provenance,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
  };
}
