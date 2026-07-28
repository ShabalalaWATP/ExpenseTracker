import { listAudit } from "@/src/server/audit-repository";
import { errorResponse, json } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";

export async function GET(): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    return json({ events: await listAudit(principal) });
  } catch (error) {
    return errorResponse(error);
  }
}
