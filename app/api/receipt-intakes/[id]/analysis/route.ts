import {
  errorResponse,
  json,
  readBoundedBody,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import {
  parseImageEditsHeader,
  parseTargetedFields,
} from "@/src/server/receipt-analysis-options";
import { requirePrincipal } from "@/src/server/principal";
import { analyseReceiptIntake } from "@/src/server/receipt-intake-processing";
import { reanalyseStoredReceiptIntake } from "@/src/server/receipt-intake-reanalysis";
import { assertId } from "@/src/server/validation";

const MAX_ANALYSIS_BYTES = 10 * 1024 * 1024;
type Context = { params: Promise<{ id: string }> };

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const bytes = await readBoundedBody(request, MAX_ANALYSIS_BYTES);
    const intake = await analyseReceiptIntake(
      principal,
      id,
      bytes,
      request.headers.get("Content-Type"),
      {
        imageEdits: parseImageEditsHeader(
          request.headers.get("X-Image-Edits"),
        ),
      },
    );
    return json({ intake });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const fields = parseTargetedFields(await readJson(request));
    const intake = await reanalyseStoredReceiptIntake(principal, id, fields);
    return json({ intake });
  } catch (error) {
    return errorResponse(error);
  }
}
