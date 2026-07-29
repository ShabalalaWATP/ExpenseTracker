import { restoreExpense } from "@/src/server/expense-repository";
import {
  errorResponse,
  json,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { assertId } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    return json({ expense: await restoreExpense(principal, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
