"use client";

import { useState } from "react";
import { receiptEvidenceUrls } from "../../src/domain/receipt-evidence";
import { prepareClaim, submitClaim } from "./api";
import { AuditReportPanel } from "./AuditReportPanel";
import { ClaimPackageDownloads } from "./ClaimPackageDownloads";
import {
  claimPeriodExpenses,
  claimDescription,
  claimHandoffText,
} from "./claim-handoff";
import { formatDate, formatMoney } from "./format";
import type { DashboardData, NavigationTarget, ViewName } from "./types";
import { EmptyState, StatusMessage, ViewHeader } from "./ui";

export function ClaimsView({
  data,
  navigate,
  navigateTarget,
  onChanged,
  claimPeriod,
  onClaimPeriodChange,
}: {
  data: DashboardData;
  navigate: (view: ViewName) => void;
  navigateTarget: (target: NavigationTarget) => void;
  onChanged: () => Promise<void>;
  claimPeriod: string;
  onClaimPeriodChange: (period: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const claimPeriodLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${claimPeriod}-01T00:00:00Z`));
  const currentClaim = [...data.claims]
    .filter((claim) => !claim.period || claim.period === claimPeriod)
    .sort((a, b) => (b.preparedAt ?? "").localeCompare(a.preparedAt ?? ""))[0];
  const handoffExpenses = claimPeriodExpenses(data.expenses, claimPeriod);

  async function copy(text: string, label: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setError("Safari could not copy this text. Select the description and copy it manually.");
    }
  }

  async function prepare() {
    setBusy("prepare");
    setError("");
    setMessage("");
    try {
      await prepareClaim(claimPeriod);
      setMessage(`${claimPeriodLabel} is prepared and its figures are now frozen.`);
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
      setMessage(`${claimPeriodLabel} has been marked as submitted.`);
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
        eyebrow={claimPeriodLabel}
        title={data.claimReady ? "Ready to prepare" : "Finish these checks first"}
        detail="Review the receipt evidence and totals, then freeze a submission snapshot."
      />
      <div className="claim-period-control">
        <label htmlFor="claim-period">Claim month</label>
        <input
          id="claim-period"
          type="month"
          value={claimPeriod}
          onChange={(event) => {
            if (/^\d{4}-\d{2}$/.test(event.target.value)) {
              setMessage("");
              setError("");
              onClaimPeriodChange(event.target.value);
            }
          }}
        />
        <small>All totals and readiness checks below are for this month, not just today.</small>
      </div>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {message ? <StatusMessage tone="success">{message}</StatusMessage> : null}

      <section className="claim-totals" aria-labelledby="claim-totals-heading">
        <p className="eyebrow" id="claim-totals-heading">Current calculation</p>
        <dl>
          <div><dt>Confirmed eligible spend</dt><dd>{formatMoney(data.confirmedEligiblePence)}</dd></div>
          <div><dt>Eligible after policy checks</dt><dd>{formatMoney(data.policyEligiblePence)}</dd></div>
          <div className="claimable"><dt>Claimable after allowance</dt><dd>{formatMoney(data.claimablePence)}</dd></div>
          <div><dt>Over £30 food limit</dt><dd>{formatMoney(data.overLimitPence)}</dd></div>
          <div><dt>Blocked confirmed spend</dt><dd>{formatMoney(data.blockedConfirmedPence)}</dd></div>
          <div><dt>Awaiting review (estimate)</dt><dd>{formatMoney(data.pendingEstimatedEligiblePence)}</dd></div>
        </dl>
        <p>
          {data.pendingReceiptCount
            ? `${data.pendingReceiptCount} receipt${data.pendingReceiptCount === 1 ? " is" : "s are"} still pending for this month. `
            : "There are no dated pending receipts for this month. "}
          Pending estimates are shown for visibility but never count as eligible or claimable.
          {data.undatedPendingCount
            ? ` ${data.undatedPendingCount} undated receipt${data.undatedPendingCount === 1 ? " also needs" : "s also need"} a confirmed month.`
            : ""}
          {" "}Receipts dated outside this month remain with their own claim month.
        </p>
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
                <li key={item.id ?? index}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong>{item.detail ? <p>{item.detail}</p> : null}</div><button type="button" className="text-button" onClick={() => item.target ? navigateTarget(item.target) : navigate(item.view ?? "expenses")}>Review</button></li>
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
                <small>{currentClaim.preparedAt ? `Prepared ${formatDate(currentClaim.preparedAt.slice(0, 10))}` : claimPeriodLabel}</small>
              </div>
              <ClaimPackageDownloads claimId={currentClaim.id} />
              {currentClaim.status !== "submitted" ? <button className="primary-button full-button" type="button" onClick={() => void markSubmitted()} disabled={busy === "submit"}>{busy === "submit" ? "Updating…" : "Mark as submitted"}</button> : <StatusMessage tone="success">This snapshot is recorded as submitted.</StatusMessage>}
            </>
          ) : handoffExpenses.length || data.pendingReceiptCount ? (
            <>
              <p className="handoff-copy">Preparing creates an immutable claim and prevents later recalculation from silently changing these figures.</p>
              <button className="primary-button full-button" type="button" onClick={() => void prepare()} disabled={!data.claimReady || busy === "prepare"}>{busy === "prepare" ? "Preparing…" : "Prepare immutable claim"}</button>
              {!data.claimReady ? <small>Complete the readiness issues first.</small> : null}
            </>
          ) : (
            <EmptyState title="Nothing to prepare">Add a receipt dated in {claimPeriodLabel} to begin this claim.</EmptyState>
          )}
        </section>
      </div>

      {handoffExpenses.length ? (
        <section className="submission-pack" aria-labelledby="submission-pack-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Receipt photos and descriptions</p>
              <h2 id="submission-pack-heading">{claimPeriodLabel} submission pack</h2>
            </div>
            <button className="text-button" type="button" onClick={() => void copy(claimHandoffText(handoffExpenses, claimPeriod), "all")}>
              {copied === "all" ? "Copied all" : "Copy all descriptions"}
            </button>
          </div>
          <p className="handoff-copy">Each item keeps the exact receipt photo with a copy-ready description of where you were and why.</p>
          <ol className="submission-list">
            {handoffExpenses.map((expense) => {
              const description = claimDescription(expense);
              const receiptUrl = expense.receiptUrl;
              const evidenceUrls = receiptEvidenceUrls(expense);
              return (
                <li key={expense.id}>
                  <div>
                    <span>{formatDate(expense.date)}</span>
                    <strong>{expense.merchant} · {formatMoney(expense.eligibleAmountPence)}</strong>
                    <p>{description || "Location or duty reason still needs attention."}</p>
                  </div>
                  <div className="submission-actions">
                    <button type="button" className="text-button" disabled={!description} onClick={() => void copy(description, expense.id)}>
                      {copied === expense.id ? "Copied" : "Copy where and why"}
                    </button>
                    {receiptUrl ? (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          navigateTarget({
                            view: "claims",
                            expenseId: expense.id,
                          })
                        }
                      >
                        View receipt
                      </button>
                    ) : null}
                    {receiptUrl ? <a className="text-button" href={evidenceUrls.download}>Download photo</a> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <AuditReportPanel />
    </div>
  );
}
