import { buildClaimPackage } from "@/src/server/claim-package";
import { errorResponse } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { assertId } from "@/src/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const id = assertId((await context.params).id);
    const part = Number(new URL(request.url).searchParams.get("part") || "1");
    const result = await buildClaimPackage(principal, id, part);
    const suffix = result.partCount > 1
      ? `-part-${part}-of-${result.partCount}`
      : "";
    return new Response(result.bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="ExpenseTracker-${result.period}-submission${suffix}.zip"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
