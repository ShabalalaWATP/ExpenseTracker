import {
  generateAuditReport,
  parseAnswers,
  parseAuditQuestions,
  parseAuditRange,
} from "@/src/server/audit-report";
import {
  errorResponse,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const body = (await readJson(request)) as Record<string, unknown>;
    const range = parseAuditRange(body);
    const questions = parseAuditQuestions(body.questions);
    const answers = parseAnswers(body.answers);
    const ai =
      body.ai && typeof body.ai === "object" && !Array.isArray(body.ai)
        ? (body.ai as Record<string, unknown>)
        : {};
    const result = await generateAuditReport(principal, {
      range,
      questions,
      answers,
      ai: {
        used: ai.used === true,
        model: typeof ai.model === "string" ? ai.model.slice(0, 80) : "",
        summary:
          typeof ai.summary === "string" ? ai.summary.slice(0, 2_000) : "",
      },
    });
    return new Response(result.bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Type": DOCX_CONTENT_TYPE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
