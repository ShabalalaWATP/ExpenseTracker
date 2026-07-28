import { errorResponse } from "@/src/server/http";
import { receiptObject } from "@/src/server/receipt-repository";
import { requirePrincipal } from "@/src/server/principal";
import { assertId } from "@/src/server/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const { row, object } = await receiptObject(principal, id);
    const extension =
      row.content_type === "image/jpeg"
        ? "jpg"
        : row.content_type === "image/png"
          ? "png"
          : "heic";
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": row.content_type,
        "Content-Length": String(row.byte_size),
        "Content-Disposition": `inline; filename="receipt-${id}.${extension}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
