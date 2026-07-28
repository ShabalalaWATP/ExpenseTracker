import {
  deleteExpense,
  updateExpense,
} from "@/src/server/expense-repository";
import {
  empty,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { removeReceiptObject } from "@/src/server/receipt-repository";
import { assertId, parseExpense } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const id = assertId((await context.params).id);
    const input = parseExpense(await readJson(request), true);
    return json({ expense: await updateExpense(id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const id = assertId((await context.params).id);
    const objectKey = await deleteExpense(id);
    await removeReceiptObject(objectKey);
    return empty();
  } catch (error) {
    return errorResponse(error);
  }
}
