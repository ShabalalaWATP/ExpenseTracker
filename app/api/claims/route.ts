import { createClaimSnapshot } from "@/src/server/claim-repository";
import {
  acquireClaimPeriodLock,
  finaliseClaimPeriodLock,
  releaseClaimPeriodLock,
} from "@/src/server/claim-locks";
import { dashboard } from "@/src/server/dashboard";
import {
  ApiError,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { parsePeriod } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  let ownerId = "";
  let period = "2026-08" as const;
  let lockToken = "";
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    ownerId = principal.ownerId;
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "validation_failed", "The request body is invalid.");
    }
    period = parsePeriod((body as Record<string, unknown>).period);
    lockToken = await acquireClaimPeriodLock(principal.ownerId, period);
    const state = await dashboard(principal);
    if (!state.readiness.ready) {
      throw new ApiError(
        409,
        "readiness_not_met",
        "Resolve the outstanding August claim checks first.",
        state.readiness.issues,
      );
    }
    const claim = await createClaimSnapshot(principal, {
      period,
      expenses: state.expenses.filter((expense) =>
        expense.serviceDate.startsWith(`${period}-`),
      ),
      trips: state.trips.filter(
        (trip) =>
          trip.days.some((day) => day.date.startsWith(`${period}-`)) ||
          state.expenses.some(
            (expense) =>
              expense.serviceDate.startsWith(`${period}-`) &&
              expense.tripId === trip.id,
          ),
      ),
      summary: state.summary,
      calculation: state.calculation,
    });
    await finaliseClaimPeriodLock(principal.ownerId, period, lockToken);
    lockToken = "";
    return json({ claim }, 201);
  } catch (error) {
    if (lockToken && ownerId) {
      await releaseClaimPeriodLock(ownerId, period, lockToken).catch(() => {});
    }
    return errorResponse(error);
  }
}
