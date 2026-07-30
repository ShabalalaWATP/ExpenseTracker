import type { Principal } from "./principal";
import type { Provenance } from "./receipt-analysis-merge";
import {
  resolveAutomaticTripLink,
  type AutomaticTripLinkResolution,
} from "./trip-auto-link";

export const AMBIGUOUS_TRIP_MESSAGE =
  "This receipt date matches more than one confirmed eligible trip. Select the correct trip before confirming the expense.";

export type ReceiptTripLink = {
  resolution: AutomaticTripLinkResolution;
  tripId: string | null;
  provenance: Provenance;
  errorCode: "receipt_trip_ambiguous" | null;
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
    provenance: Provenance;
  },
): Promise<ReceiptTripLink> {
  const resolution = await resolveAutomaticTripLink(principal, {
    serviceDate: input.serviceDate,
    tripId: input.tripId,
    explicitlySelected: input.provenance.trip_id === "owner",
  });
  const provenance = { ...input.provenance };
  if (resolution.status === "matched") {
    provenance.trip_id = "auto";
  } else if (resolution.status !== "explicit") {
    delete provenance.trip_id;
  }
  const ambiguous = resolution.status === "ambiguous";
  return {
    resolution,
    tripId: resolution.tripId,
    provenance,
    errorCode: ambiguous ? "receipt_trip_ambiguous" : null,
    errorMessage: ambiguous ? AMBIGUOUS_TRIP_MESSAGE : null,
  };
}
