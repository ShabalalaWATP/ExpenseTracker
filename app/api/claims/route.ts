import { createClaimSnapshot } from "@/src/server/claim-repository";
import { dashboard } from "@/src/server/dashboard";
import {
  ApiError,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { parsePeriod } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "validation_failed", "The request body is invalid.");
    }
    const period = parsePeriod((body as Record<string, unknown>).period);
    const state = await dashboard();
    if (!state.readiness.ready) {
      throw new ApiError(
        409,
        "readiness_not_met",
        "Resolve the outstanding August claim checks first.",
        state.readiness.issues,
      );
    }
    const claim = await createClaimSnapshot({
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
    return json({ claim }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
