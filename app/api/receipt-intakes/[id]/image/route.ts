import { errorResponse } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { receiptIntakeObject } from "@/src/server/receipt-intake-repository";
import { assertId } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

function extension(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return contentType === "image/heif" ? "heif" : "heic";
}

export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const { row, object } = await receiptIntakeObject(principal, id);
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": row.content_type,
        "Content-Length": String(row.byte_size),
        "Content-Disposition": `inline; filename="receipt-${id}.${extension(
          row.content_type,
        )}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
