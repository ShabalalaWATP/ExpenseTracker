import { parseAuditRange, planAuditReport } from "@/src/server/audit-report";
import {
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const range = parseAuditRange(await readJson(request));
    return json(await planAuditReport(principal, range));
  } catch (error) {
    return errorResponse(error);
  }
}
