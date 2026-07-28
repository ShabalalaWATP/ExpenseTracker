import {
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { saveClarification } from "@/src/server/receipt-intake-processing";
import { parseIntakePatch } from "@/src/server/receipt-intake-validation";
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
    const intake = await saveClarification(
      principal,
      id,
      parseIntakePatch(await readJson(request)),
    );
    return json({ intake });
  } catch (error) {
    return errorResponse(error);
  }
}
