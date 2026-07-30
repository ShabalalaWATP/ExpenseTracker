import {
  errorResponse,
  json,
  readBoundedBody,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import {
  MAX_RECEIPT_PREVIEW_BYTES,
  storeExpenseReceiptPreview,
} from "@/src/server/receipt-preview";
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
    const bytes = await readBoundedBody(request, MAX_RECEIPT_PREVIEW_BYTES);
    const preview = await storeExpenseReceiptPreview(
      principal,
      id,
      bytes,
      request.headers.get("Content-Type"),
    );
    return json({
      preview: {
        contentType: preview.contentType,
        byteSize: preview.byteSize,
        width: preview.dimensions.width,
        height: preview.dimensions.height,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
