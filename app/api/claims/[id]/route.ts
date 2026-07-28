import { submitClaim } from "@/src/server/claim-repository";
import {
  ApiError,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { assertId } from "@/src/server/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "validation_failed", "The request body is invalid.");
    }
    if ((body as Record<string, unknown>).status !== "submitted") {
      throw new ApiError(
        400,
        "validation_failed",
        "The only supported claim status is submitted.",
      );
    }
    const id = assertId((await context.params).id);
    return json({ claim: await submitClaim(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
