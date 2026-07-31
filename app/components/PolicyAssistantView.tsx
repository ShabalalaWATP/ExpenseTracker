"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import policyManifest from "@/src/policy/jsp752-v66.1-manifest.json";
import {
  askPolicyAssistant,
  type PolicyAssistantAnswer,
  type PolicyAssistantCitation,
} from "./api";
import { PolicyVoiceAssistant } from "./PolicyVoiceAssistant";
import { StatusMessage, ViewHeader } from "./ui";

const POLICY_URL =
  "https://www.gov.uk/government/publications/jsp-752-tri-service-regulations-for-expenses-and-allowances";
const STORED_POLICY_URL = policyManifest.localPdfPath;

const starters = [
  "How does the £30 daily limit work?",
  "When can I aggregate several days?",
  "What food and drink can I claim?",
  "What evidence do I need for Day Subsistence?",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: PolicyAssistantCitation[];
  storedPages?: number[];
  storedSource?: PolicyAssistantAnswer["storedSource"];
  model?: string;
};

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    `Ask me about JSP 752 Day Subsistence, receipts, the £30 limit, aggregation or eligible food and drink. I search the complete ${policyManifest.pageCount}-page JSP stored in this app, then check the current official GOV.UK source.`,
};

function citedText(text: string, citations: PolicyAssistantCitation[]): ReactNode[] {
  const ordered = [...citations]
    .filter((citation) => citation.endIndex <= text.length)
    .sort((a, b) => a.endIndex - b.endIndex);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  ordered.forEach((citation, index) => {
    if (citation.endIndex <= cursor) return;
    nodes.push(text.slice(cursor, citation.endIndex));
    nodes.push(
      <a
        className="inline-citation"
        href={citation.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open source ${index + 1}: ${citation.title}`}
        key={`${citation.url}-${citation.endIndex}`}
      >
        [{index + 1}]
      </a>,
    );
    cursor = citation.endIndex;
  });
  nodes.push(text.slice(cursor));
  return nodes;
}

export function PolicyAssistantView() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const messagesRef = useRef<ChatMessage[]>([welcome]);
  const busyRef = useRef(false);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answerQuestion(
    question: string,
  ): Promise<PolicyAssistantAnswer> {
    const clean = question.trim();
    if (!clean) throw new Error("Ask a JSP 752 question first.");
    if (busyRef.current) {
      throw new Error("Wait for the current policy answer to finish.");
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
    };
    const nextMessages = [...messagesRef.current, userMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setBusy(true);
    busyRef.current = true;
    try {
      const answer = await askPolicyAssistant(
        nextMessages
          .filter((message) => message.id !== "welcome")
          .slice(-9)
          .map(({ role, content }) => ({ role, content })),
      );
      const next = [
        ...messagesRef.current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer.answer,
          citations: answer.citations,
          storedPages: answer.storedPages,
          storedSource: answer.storedSource,
          model: answer.model,
        },
      ] satisfies ChatMessage[];
      messagesRef.current = next;
      setMessages(next);
      return answer;
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The policy assistant could not answer just now.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  function sendText(question: string) {
    void answerQuestion(question).catch(() => undefined);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendText(draft);
  }

  return (
    <div className="view page-enter policy-assistant-view">
      <ViewHeader
        eyebrow="Stored JSP 752 · live official check"
        title="Policy assistant"
        detail="Ask a question and get a plain-English answer from the complete stored policy, checked against current GOV.UK sources."
        action={
          <>
            <a className="secondary-button" href={STORED_POLICY_URL} target="_blank" rel="noreferrer">
              Open stored JSP
            </a>
            <a className="text-button" href={POLICY_URL} target="_blank" rel="noreferrer">
              Check GOV.UK
            </a>
          </>
        }
      />

      <div className="policy-boundary">
        <strong>Complete policy stored</strong>
        <span>{policyManifest.version}, all {policyManifest.pageCount} pages, is included in this release. The assistant cannot approve a claim, change expenses or see your receipts and ledger.</span>
      </div>

      <div className="policy-chat" aria-label="Policy conversation">
        <div className="policy-mode-tabs" role="group" aria-label="Policy assistant input">
          <button
            type="button"
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
          >
            Text chat
          </button>
          <button
            type="button"
            aria-pressed={mode === "voice"}
            onClick={() => setMode("voice")}
          >
            Voice chat
          </button>
        </div>

        {mode === "text" ? (
          <div className="policy-starters" aria-label="Suggested questions">
            <span>Try asking</span>
            {starters.map((starter) => (
              <button type="button" key={starter} onClick={() => sendText(starter)} disabled={busy}>
                {starter}
              </button>
            ))}
          </div>
        ) : (
          <PolicyVoiceAssistant onQuestion={answerQuestion} />
        )}

        <ol className="policy-messages" aria-live="polite">
          {messages.map((message) => (
            <li className={message.role} key={message.id}>
              <span>{message.role === "assistant" ? "Policy assistant" : "You"}</span>
              <p>
                {message.role === "assistant" && message.citations?.length
                  ? citedText(message.content, message.citations)
                  : message.content}
              </p>
              {message.citations?.length ? (
                <details className="policy-sources">
                  <summary>{message.citations.length} official {message.citations.length === 1 ? "source" : "sources"}</summary>
                  <ol>
                    {message.citations.map((citation, index) => (
                      <li key={`${citation.url}-${index}`}>
                        <a href={citation.url} target="_blank" rel="noreferrer">
                          {index + 1}. {citation.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
              {message.storedPages?.length ? (
                <small className="stored-policy-pages">
                  Retrieved {message.storedSource?.version ?? "stored JSP 752"} pages supplied to the assistant:{" "}
                  {message.storedPages.map((page, index) => (
                    <span key={page}>
                      {index ? ", " : ""}
                      <a href={`${STORED_POLICY_URL}#page=${page}`} target="_blank" rel="noreferrer">
                        {page}
                      </a>
                    </span>
                  ))}
                </small>
              ) : null}
              {message.model ? <small>Answered by {message.model}</small> : null}
            </li>
          ))}
          {busy ? (
            <li className="assistant policy-thinking">
              <span>Policy assistant</span>
              <p>Searching the stored JSP, then checking GOV.UK…</p>
            </li>
          ) : null}
        </ol>

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        {mode === "text" ? (
          <form className="policy-composer" onSubmit={submit}>
            <label htmlFor="policy-question">Your JSP 752 question</label>
            <textarea
              id="policy-question"
              value={draft}
              maxLength={2_000}
              rows={3}
              placeholder="For example, can I include a service charge?"
              onChange={(event) => setDraft(event.target.value)}
            />
            <div>
              <small>Questions are sent to OpenAI for a sourced answer. Conversation history is not saved by ExpenseTracker.</small>
              <button className="primary-button" type="submit" disabled={busy || !draft.trim()}>
                {busy ? "Checking…" : "Ask question"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {messages.length > 1 ? (
        <button className="text-button policy-clear" type="button" onClick={() => {
          messagesRef.current = [welcome];
          setMessages([welcome]);
          setError("");
        }}>
          Clear conversation
        </button>
      ) : null}
    </div>
  );
}
