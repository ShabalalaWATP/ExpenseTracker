export class PolicyContractError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type PolicyConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PolicyCitation = {
  startIndex: number;
  endIndex: number;
  url: string;
  title: string;
};

export type PolicyAnswer = {
  answer: string;
  citations: PolicyCitation[];
  model: string;
  policyVersion: string;
};

function cleanMessage(value: unknown): PolicyConversationMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PolicyContractError(400, "policy_message_invalid", "A conversation message is invalid.");
  }
  const item = value as Record<string, unknown>;
  if (item.role !== "user" && item.role !== "assistant") {
    throw new PolicyContractError(400, "policy_role_invalid", "Only user and assistant messages are accepted.");
  }
  if (typeof item.content !== "string") {
    throw new PolicyContractError(400, "policy_content_invalid", "A policy question is missing.");
  }
  const content = item.content.trim();
  if (!content || content.length > 2_000) {
    throw new PolicyContractError(
      400,
      "policy_content_invalid",
      "Each policy message must contain between 1 and 2,000 characters.",
    );
  }
  return { role: item.role, content };
}

export function parsePolicyConversation(input: unknown): PolicyConversationMessage[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PolicyContractError(400, "policy_request_invalid", "The policy question is invalid.");
  }
  const messages = (input as Record<string, unknown>).messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 10) {
    throw new PolicyContractError(
      400,
      "policy_messages_invalid",
      "Send between 1 and 10 recent conversation messages.",
    );
  }
  const cleaned = messages.map(cleanMessage);
  if (cleaned.at(-1)?.role !== "user") {
    throw new PolicyContractError(400, "policy_question_missing", "The latest message must be your question.");
  }
  if (cleaned.reduce((sum, message) => sum + message.content.length, 0) > 8_000) {
    throw new PolicyContractError(413, "policy_conversation_too_large", "Start a new policy conversation.");
  }
  return cleaned;
}

function allowedGovernmentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "gov.uk" || host.endsWith(".gov.uk"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function extractPolicyAnswer(
  response: unknown,
  fallbackModel: string,
): PolicyAnswer {
  if (!response || typeof response !== "object") {
    throw new PolicyContractError(502, "policy_output_invalid", "The policy assistant returned no usable answer.");
  }
  const root = response as Record<string, unknown>;
  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const textPart = part as Record<string, unknown>;
      if (typeof textPart.text !== "string" || !textPart.text.trim()) continue;
      const rawAnswer = textPart.text.slice(0, 6_000);
      const leadingWhitespace = rawAnswer.length - rawAnswer.trimStart().length;
      const answer = rawAnswer.trim();
      const annotations = Array.isArray(textPart.annotations)
        ? textPart.annotations
        : [];
      const citations = annotations.flatMap((annotation): PolicyCitation[] => {
        if (!annotation || typeof annotation !== "object") return [];
        const value = annotation as Record<string, unknown>;
        const url = allowedGovernmentUrl(value.url);
        const startIndex = Number(value.start_index) - leadingWhitespace;
        const endIndex = Number(value.end_index) - leadingWhitespace;
        if (
          value.type !== "url_citation" ||
          !url ||
          !Number.isSafeInteger(startIndex) ||
          !Number.isSafeInteger(endIndex) ||
          startIndex < 0 ||
          endIndex <= startIndex ||
          endIndex > answer.length
        ) return [];
        return [{
          startIndex,
          endIndex,
          url,
          title:
            typeof value.title === "string" && value.title.trim()
              ? value.title.trim().slice(0, 200)
              : "Official GOV.UK source",
        }];
      });
      if (citations.length === 0) {
        throw new PolicyContractError(
          502,
          "policy_citations_missing",
          "The policy assistant could not verify its answer against an official source.",
        );
      }
      return {
        answer,
        citations: citations.slice(0, 12),
        model: typeof root.model === "string" ? root.model : fallbackModel,
        policyVersion: "JSP 752 v66.1, May 2026",
      };
    }
  }
  throw new PolicyContractError(502, "policy_output_missing", "The policy assistant returned no usable answer.");
}
