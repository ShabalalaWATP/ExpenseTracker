import { createExpense } from "@/src/server/expense-repository";
import {
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { parseExpense } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const input = parseExpense(await readJson(request));
    return json({ expense: await createExpense(principal, input) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
