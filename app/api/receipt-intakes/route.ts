import {
  errorResponse,
  json,
  readBoundedBody,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import {
  createReceiptIntake,
  listReceiptIntakes,
} from "@/src/server/receipt-intake-repository";
import { parseIntakeHeaders } from "@/src/server/receipt-intake-validation";
import { MAX_RECEIPT_BYTES } from "@/src/server/receipt-repository";

export async function GET(): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    return json({ intakes: await listReceiptIntakes(principal) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const bytes = await readBoundedBody(request, MAX_RECEIPT_BYTES);
    const result = await createReceiptIntake(
      principal,
      parseIntakeHeaders(request.headers),
      bytes,
      request.headers.get("Content-Type"),
      request.headers.get("Idempotency-Key"),
    );
    return json({ intake: result.intake }, result.created ? 201 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}
