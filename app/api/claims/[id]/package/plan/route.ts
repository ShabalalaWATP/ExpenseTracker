import { getClaimPackagePlan } from "@/src/server/claim-package";
import { errorResponse, json } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { assertId } from "@/src/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const id = assertId((await context.params).id);
    return json(await getClaimPackagePlan(await requirePrincipal(), id));
  } catch (error) {
    return errorResponse(error);
  }
}
