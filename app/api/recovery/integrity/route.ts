import { errorResponse, json } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { checkEvidenceIntegrity } from "@/src/server/recovery-service";

export async function GET(): Promise<Response> {
  try {
    return json(await checkEvidenceIntegrity(await requirePrincipal()));
  } catch (error) {
    return errorResponse(error);
  }
}
