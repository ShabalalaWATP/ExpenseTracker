import {
  ApiError,
  errorResponse,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";
import {
  buildCsvExport,
  buildJsonExport,
} from "@/src/server/export-service";

function download(body: BodyInit, contentType: string, extension: string) {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="ExpenseTracker-${date}.${extension}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    if (format === "json") {
      return download(
        JSON.stringify(await buildJsonExport(principal), null, 2),
        "application/json; charset=utf-8",
        "json",
      );
    }
    if (format === "csv") {
      return download(
        `\uFEFF${await buildCsvExport(principal)}`,
        "text/csv; charset=utf-8",
        "csv",
      );
    }
    throw new ApiError(
      400,
      "format_invalid",
      "Choose JSON or CSV export format.",
    );
  } catch (error) {
    return errorResponse(error);
  }
}
