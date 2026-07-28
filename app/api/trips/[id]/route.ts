import {
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { updateTrip } from "@/src/server/trip-repository";
import { assertId, parseTrip } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    return json({
      trip: await updateTrip(
        principal,
        id,
        parseTrip(await readJson(request), true),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
