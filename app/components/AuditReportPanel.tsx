"use client";

import { useState } from "react";
import { apiRequest } from "./api";
import { formatMoney } from "./format";
import { StatusMessage } from "./ui";
import { auditMonthRange } from "./audit-range";
import { ukCalendarMonth } from "../../src/domain/calendar";

type AuditQuestion = {
  id: string;
  source: "rule" | "ai";
  expenseId: string | null;
  topic: string;
  detail: string;
  question: string;
};

type AuditPlan = {
  range: { startDate: string; endDate: string };
  expenseCount: number;
  totals: {
    totalSpendPence: number;
    qualifyingActualPence: number;
    allowancePence: number;
    claimablePence: number;
  };
  questions: AuditQuestion[];
  observations: Array<{ topic: string; detail: string }>;
  ai: { used: boolean; model: string; summary: string };
};

function unwrapPlan(payload: unknown): AuditPlan {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const data = (root.data ?? root) as AuditPlan;
  return {
    ...data,
    questions: Array.isArray(data.questions) ? data.questions : [],
    observations: Array.isArray(data.observations) ? data.observations : [],
  };
}

export function AuditReportPanel() {
  const initialRange = auditMonthRange(ukCalendarMonth());
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [plan, setPlan] = useState<AuditPlan | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"plan" | "report" | "">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function prepare() {
    setBusy("plan");
    setError("");
    setDone("");
    setPlan(null);
    setAnswers({});
    try {
      const result = await apiRequest<unknown>("/api/audit-reports/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      setPlan(unwrapPlan(result));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The audit review could not be prepared.",
      );
    } finally {
      setBusy("");
    }
  }

  async function download() {
    if (!plan) return;
    setBusy("report");
    setError("");
    setDone("");
    try {
      const response = await fetch("/api/audit-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          questions: plan.questions,
          answers,
          ai: plan.ai,
        }),
      });
      if (!response.ok) {
        throw new Error(`The report could not be generated (${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ExpenseTracker-audit-${startDate}-to-${endDate}.docx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDone(
        "The Word report has downloaded. Review it before sending anything to the auditor.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The report could not be generated.",
      );
    } finally {
      setBusy("");
    }
  }

  const unanswered = plan
    ? plan.questions.filter((question) => !answers[question.id]?.trim()).length
    : 0;

  return (
    <section className="audit-panel" aria-labelledby="audit-panel-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Being audited?</p>
          <h2 id="audit-panel-heading">Audit response report</h2>
        </div>
      </div>
      <p className="handoff-copy">
        Choose the dates you are being audited for. The review combines policy
        checks with an AI read of your ledger, asks you for any justifications
        it needs, and produces a Microsoft Word report you can send back.
      </p>

      <div className="audit-range">
        <label>
          <span>Audited from</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label>
          <span>Audited to</span>
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={busy !== ""}
          onClick={() => void prepare()}
        >
          {busy === "plan" ? "Reviewing your ledger…" : "Prepare audit review"}
        </button>
      </div>

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {done ? <StatusMessage tone="success">{done}</StatusMessage> : null}

      {plan ? (
        <div className="audit-plan">
          <p className="audit-summary-line">
            {plan.expenseCount} expense{plan.expenseCount === 1 ? "" : "s"} in
            scope · {formatMoney(plan.totals.claimablePence)} claimable of{" "}
            {formatMoney(plan.totals.qualifyingActualPence)} eligible spend ·{" "}
            {plan.ai.used
              ? `AI review by ${plan.ai.model}`
              : "AI review unavailable, policy checks only"}
          </p>
          {plan.ai.used && plan.ai.summary ? (
            <p className="audit-ai-summary">{plan.ai.summary}</p>
          ) : null}

          {plan.questions.length ? (
            <>
              <h3>
                Justifications needed{" "}
                <span className="count-badge">{plan.questions.length}</span>
              </h3>
              <ol className="audit-questions">
                {plan.questions.map((question) => (
                  <li key={question.id}>
                    <strong>{question.topic}</strong>
                    {question.detail ? <p>{question.detail}</p> : null}
                    <p className="audit-question-text">{question.question}</p>
                    <textarea
                      rows={2}
                      value={answers[question.id] ?? ""}
                      placeholder="Type your justification for the report…"
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    />
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="audit-clear">
              The review raised no questions. You can generate the report
              straight away.
            </p>
          )}

          <div className="form-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy !== ""}
              onClick={() => void download()}
            >
              {busy === "report"
                ? "Building Word report…"
                : unanswered
                  ? `Generate Word report (${unanswered} unanswered)`
                  : "Generate Word report"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
