import {
  answerPolicyQuestion,
  parsePolicyConversation,
} from "@/src/server/policy-assistant";
import { PolicyContractError } from "@/src/server/policy-assistant-contract";
import {
  ApiError,
  errorResponse,
  json,
  readJson,
  requireSameOrigin,
} from "@/src/server/http";
import { requirePrincipal } from "@/src/server/principal";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const principal = await requirePrincipal();
    const messages = parsePolicyConversation(await readJson(request));
    return json(await answerPolicyQuestion(principal, messages));
  } catch (error) {
    return errorResponse(
      error instanceof PolicyContractError
        ? new ApiError(error.status, error.code, error.message)
        : error,
    );
  }
}
