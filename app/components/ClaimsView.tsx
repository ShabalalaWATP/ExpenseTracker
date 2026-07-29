"use client";

import { useState } from "react";
import { prepareClaim, submitClaim } from "./api";
import { formatDate, formatMoney } from "./format";
import type { DashboardData, ViewName } from "./types";
import { EmptyState, StatusMessage, ViewHeader } from "./ui";

export function ClaimsView({
  data,
  navigate,
  onChanged,
}: {
  data: DashboardData;
  navigate: (view: ViewName) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const currentClaim = [...data.claims]
    .filter((claim) => !claim.period || claim.period === "2026-08")
    .sort((a, b) => (b.preparedAt ?? "").localeCompare(a.preparedAt ?? ""))[0];

  async function prepare() {
    setBusy("prepare");
    setError("");
    setMessage("");
    try {
      await prepareClaim();
      setMessage("The August claim snapshot is prepared and its figures are now frozen.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The claim could not be prepared.");
    } finally {
      setBusy("");
    }
  }

  async function markSubmitted() {
    if (!currentClaim) return;
    setBusy("submit");
    setError("");
    setMessage("");
    try {
      await submitClaim(currentClaim.id);
      setMessage("August has been marked as submitted.");
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The claim status could not be updated.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow="August 2026"
        title={data.claimReady ? "Ready to prepare" : "Finish these receipts first"}
        detail="Review the receipt evidence and totals, then freeze a submission snapshot."
      />
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}

      <section className="claim-totals" aria-labelledby="claim-totals-heading">
        <p className="eyebrow" id="claim-totals-heading">Current calculation</p>
        <dl>
          <div><dt>Actual eligible spend</dt><dd>{formatMoney(data.actualPence)}</dd></div>
          <div className="claimable"><dt>Claimable</dt><dd>{formatMoney(data.claimablePence)}</dd></div>
          <div><dt>Above allowance</dt><dd>{formatMoney(data.excessPence)}</dd></div>
        </dl>
        <p>The configured daily limit is applied automatically. Prepared claims keep a fixed copy of the reviewed figures.</p>
      </section>

      <div className="claims-columns">
        <section aria-labelledby="readiness-heading">
          <div className="section-heading">
            <div><p className="eyebrow">Submission check</p><h2 id="readiness-heading">Readiness</h2></div>
            <span className={`state-label ${data.claimReady ? "success" : "warning"}`}>{data.claimReady ? "Ready" : `${data.attention.length} issues`}</span>
          </div>
          {data.attention.length ? (
            <ol className="readiness-list">
              {data.attention.map((item, index) => (
                <li key={item.id ?? index}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}</div><button type="button" className="text-button" onClick={() => navigate("expenses")}>Review</button></li>
              ))}
            </ol>
          ) : (
            <div className="calm-state"><span aria-hidden="true">✓</span><p><strong>All checks pass</strong><br />Every included item has confirmed evidence and context.</p></div>
          )}
        </section>

        <section className="claim-handoff" aria-labelledby="handoff-heading">
          <div className="section-heading"><div><p className="eyebrow">Frozen record</p><h2 id="handoff-heading">Submission handoff</h2></div></div>
          {currentClaim ? (
            <>
              <div className="claim-stamp">
                <span>{currentClaim.status === "submitted" ? "Submitted" : "Prepared"}</span>
                <strong>{formatMoney(currentClaim.claimablePence)}</strong>
                <small>{currentClaim.preparedAt ? `Prepared ${formatDate(currentClaim.preparedAt.slice(0, 10))}` : "August 2026"}</small>
              </div>
              {currentClaim.status !== "submitted" ? <button className="primary-button full-button" type="button" onClick={() => void markSubmitted()} disabled={busy === "submit"}>{busy === "submit" ? "Updating…" : "Mark as submitted"}</button> : <StatusMessage tone="success">This snapshot is recorded as submitted.</StatusMessage>}
            </>
          ) : data.expenses.length ? (
            <>
              <p className="handoff-copy">Preparing creates an immutable claim and prevents later recalculation from silently changing these figures.</p>
              <button className="primary-button full-button" type="button" onClick={() => void prepare()} disabled={!data.claimReady || busy === "prepare"}>{busy === "prepare" ? "Preparing…" : "Prepare immutable claim"}</button>
              {!data.claimReady ? <small>Complete the readiness issues first.</small> : null}
            </>
          ) : (
            <EmptyState title="Nothing to prepare">Add an August expense to begin this claim.</EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
