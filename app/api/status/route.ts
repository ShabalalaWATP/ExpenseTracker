import { errorResponse, json } from "@/src/server/http";
import { operationalStatus } from "@/src/server/operational-status";
import { requirePrincipal } from "@/src/server/principal";

export async function GET(): Promise<Response> {
  try {
    return json(await operationalStatus(await requirePrincipal()));
  } catch (error) {
    return errorResponse(error);
  }
}
