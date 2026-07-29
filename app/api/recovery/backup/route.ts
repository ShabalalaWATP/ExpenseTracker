import { errorResponse } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import { buildRecoveryPackage } from "@/src/server/recovery-service";

export async function GET(request: Request): Promise<Response> {
  try {
    const part = Number(new URL(request.url).searchParams.get("part") || "1");
    const { bytes, partCount } = await buildRecoveryPackage(
      await requirePrincipal(),
      part,
    );
    const date = new Date().toISOString().slice(0, 10);
    const suffix = partCount > 1 ? `-part-${part}-of-${partCount}` : "";
    return new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="ExpenseTracker-recovery-${date}${suffix}.zip"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
