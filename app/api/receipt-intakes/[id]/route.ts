import {
  empty,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import {
  deleteReceiptIntake,
} from "@/src/server/receipt-intake-repository";
import { updateReceiptIntake } from "@/src/server/receipt-intake-review-repository";
import { parseIntakePatch } from "@/src/server/receipt-intake-validation";
import { assertId } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const intake = await updateReceiptIntake(
      principal,
      id,
      parseIntakePatch(await readJson(request)),
    );
    return json({ intake });
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
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    await deleteReceiptIntake(principal, id);
    return empty();
  } catch (error) {
    return errorResponse(error);
  }
}
