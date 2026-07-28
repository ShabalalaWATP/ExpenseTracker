import {
  errorResponse,
  json,
  readBoundedBody,
  requireSameOrigin,
} from "@/src/server/http";
import {
  attachReceipt,
  MAX_RECEIPT_BYTES,
} from "@/src/server/receipt-repository";
import { requirePrincipal } from "@/src/server/principal";
import { assertId } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const bytes = await readBoundedBody(request, MAX_RECEIPT_BYTES);
    const result = await attachReceipt(
      principal,
      id,
      bytes,
      request.headers.get("Content-Type"),
      request.headers.get("Idempotency-Key"),
    );
    return json({ receipt: result.receipt }, result.created ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
