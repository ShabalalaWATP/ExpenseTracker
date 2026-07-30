import { dashboard } from "@/src/server/dashboard";
import { errorResponse, json } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { parsePeriod } from "@/src/server/validation";

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const period = parsePeriod(new URL(request.url).searchParams.get("period") ?? undefined);
    return json(await dashboard(principal, period));
  } catch (error) {
    return errorResponse(error);
  }
}
