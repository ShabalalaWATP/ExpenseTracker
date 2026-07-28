import { createExpense } from "@/src/server/expense-repository";
import {
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { parseExpense } from "@/src/server/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const input = parseExpense(await readJson(request));
    return json({ expense: await createExpense(input) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
