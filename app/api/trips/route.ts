import {
  ApiError,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { createTrip } from "@/src/server/trip-repository";
import { parseTrip } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const input = parseTrip(await readJson(request));
    if (input.endDate! < input.startDate!) {
      throw new ApiError(
        400,
        "validation_failed",
        "endDate cannot precede startDate.",
      );
    }
    return json({ trip: await createTrip(principal, input) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
