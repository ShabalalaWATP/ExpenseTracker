import { dashboard } from "@/src/server/dashboard";
import { errorResponse, json } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";

export async function GET(): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    return json(await dashboard(principal));
  } catch (error) {
    return errorResponse(error);
  }
}
