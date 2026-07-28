import { errorResponse, json } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { publicAiStatus } from "@/src/server/runtime-config";

export async function GET(): Promise<Response> {
  try {
    await requirePrincipal();
    return json(publicAiStatus());
  } catch (error) {
    return errorResponse(error);
  }
}
