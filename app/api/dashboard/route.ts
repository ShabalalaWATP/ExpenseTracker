import { dashboard } from "@/src/server/dashboard";
import { errorResponse, json } from "@/src/server/http";

export async function GET(): Promise<Response> {
  try {
    return json(await dashboard());
  } catch (error) {
    return errorResponse(error);
  }
}
