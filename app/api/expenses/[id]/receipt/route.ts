import {
  errorResponse,
  json,
  readBoundedBody,
  requireSameOrigin,
} from "@/src/server/http";
import {
  attachReceipt,
  expenseReceiptObject,
  MAX_RECEIPT_BYTES,
} from "@/src/server/receipt-repository";
import { requirePrincipal } from "@/src/server/principal";
import { assertId } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

function extension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return contentType === "image/heif" ? "heif" : "heic";
}

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const download =
      new URL(request.url).searchParams.get("download") === "1";
    const evidence = await expenseReceiptObject(principal, id, download);
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": evidence.contentType,
      "Content-Disposition": `${
        download ? "attachment" : "inline"
      }; filename="receipt-${id}.${extension(evidence.contentType)}"`,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    if (evidence.byteSize !== undefined) {
      headers.set("Content-Length", String(evidence.byteSize));
    }
    return new Response(evidence.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

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
