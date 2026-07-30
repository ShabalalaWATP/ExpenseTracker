"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  askPolicyAssistant,
  type PolicyAssistantCitation,
} from "./api";
import { StatusMessage, ViewHeader } from "./ui";

const POLICY_URL =
  "https://www.gov.uk/government/publications/jsp-752-tri-service-regulations-for-expenses-and-allowances";

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
  model?: string;
};

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask me about JSP 752 Day Subsistence, receipts, the £30 limit, aggregation or eligible food and drink. I check current official GOV.UK sources before answering.",
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
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(question: string) {
    const clean = question.trim();
    if (!clean || busy) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const answer = await askPolicyAssistant(
        nextMessages
          .filter((message) => message.id !== "welcome")
          .slice(-9)
          .map(({ role, content }) => ({ role, content })),
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: answer.answer,
          citations: answer.citations,
          model: answer.model,
        },
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The policy assistant could not answer just now.",
      );
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <div className="view page-enter policy-assistant-view">
      <ViewHeader
        eyebrow="JSP 752 · official sources"
        title="Policy assistant"
        detail="Ask a question and get a short, sourced explanation in plain English."
        action={
          <a className="secondary-button" href={POLICY_URL} target="_blank" rel="noreferrer">
            Open official policy
          </a>
        }
      />

      <div className="policy-boundary">
        <strong>Explains policy</strong>
        <span>It cannot approve a claim, change expenses or see your receipts and ledger.</span>
      </div>

      <div className="policy-chat" aria-label="Policy conversation">
        <div className="policy-starters" aria-label="Suggested questions">
          <span>Try asking</span>
          {starters.map((starter) => (
            <button type="button" key={starter} onClick={() => void send(starter)} disabled={busy}>
              {starter}
            </button>
          ))}
        </div>

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
              {message.model ? <small>Answered by {message.model}</small> : null}
            </li>
          ))}
          {busy ? (
            <li className="assistant policy-thinking">
              <span>Policy assistant</span>
              <p>Checking the latest official JSP 752…</p>
            </li>
          ) : null}
        </ol>

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

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
      </div>

      {messages.length > 1 ? (
        <button className="text-button policy-clear" type="button" onClick={() => { setMessages([welcome]); setError(""); }}>
          Clear conversation
        </button>
      ) : null}
    </div>
  );
}
