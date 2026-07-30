"use client";

import { useState, type FormEvent } from "react";
import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { parsePence } from "../format";
import {
  EXPENSE_CATEGORY_OPTIONS,
  type DashboardData,
  type ExpenseCategory,
  type MealContext,
} from "../types";
import { CorrectionHistory } from "./CorrectionHistory";
import { DuplicateReview } from "./DuplicateReview";
import { IntakeOptionalContext } from "./IntakeOptionalContext";
import { ReceiptConfirmationActions } from "./ReceiptConfirmationActions";
import { ReceiptFactSummary } from "./ReceiptFactSummary";
import { ReceiptImageAdjuster } from "./ReceiptImageAdjuster";
import { ReceiptLineItems } from "./ReceiptLineItems";
import { ReceiptReviewStatus } from "./ReceiptReviewStatus";
import { ReconciliationCard } from "./ReconciliationCard";
import { validateIntakeReview } from "./intake-review-validation";
import {
  confidenceLabel,
  fieldFlagged,
} from "./receipt-field-state";
import { confirmIntake, patchIntake } from "./receiptApi";
import type {
  ImageEdits,
  IntakePatch,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";
import { VoiceClarification } from "./VoiceClarification";

function pounds(pence: number | null) {
  return pence === null ? "" : (pence / 100).toFixed(2);
}

export function IntakeReview({
  intake,
  data,
  voiceAvailable,
  canRetryAnalysis,
  canReanalyse,
  analysisBusy,
  analysisModel,
  onUpdate,
  onRetryAnalysis,
  onReanalyse,
  onAnalyseWithEdits,
  onConfirmed,
}: {
  intake: ReceiptIntake;
  data: DashboardData;
  voiceAvailable: boolean;
  canRetryAnalysis: boolean;
  canReanalyse: boolean;
  analysisBusy: boolean;
  analysisModel: string;
  onUpdate: (next: ReceiptIntake) => void;
  onRetryAnalysis: () => Promise<void>;
  onReanalyse: (fields: ReceiptRecheckField[]) => Promise<void>;
  onAnalyseWithEdits: (edits: ImageEdits) => Promise<void>;
  onConfirmed: () => Promise<void>;
}) {
  const [merchant, setMerchant] = useState(intake.merchant ?? "");
  const [date, setDate] = useState(intake.serviceDate ?? "");
  const [total, setTotal] = useState(pounds(intake.receiptTotalPence));
  const [eligible, setEligible] = useState(pounds(intake.eligiblePence));
  const [gratuity, setGratuity] = useState(pounds(intake.gratuityPence));
  const [location, setLocation] = useState(intake.location ?? "");
  const [reason, setReason] = useState(intake.businessReason ?? "");
  const [meal, setMeal] = useState<MealContext>(intake.mealContext ?? "");
  const [category, setCategory] = useState<ExpenseCategory | "">(
    intake.category ?? "",
  );
  const [tripId, setTripId] = useState(intake.tripId ?? "");
  const [tripDecision, setTripDecision] = useState<
    "unchanged" | "selected" | "leave_unlinked"
  >("unchanged");
  const [alcoholReviewed, setAlcoholReviewed] = useState(intake.alcoholReviewed);
  const [duplicateReviewed, setDuplicateReviewed] = useState(
    intake.duplicateReviewed,
  );
  const [reconciliationReviewed, setReconciliationReviewed] = useState(
    intake.reconciliationReviewed,
  );
  const [busy, setBusy] = useState<"saving" | "confirming" | "">("");
  const [message, setMessage] = useState("");

  const flagged = (field: string) => fieldFlagged(intake, field);
  const confidence = (field: string) => confidenceLabel(intake, field);

  function fields(): IntakePatch {
    const review: IntakePatch = {
      merchant: merchant.trim() || null,
      serviceDate: date || null,
      receiptTotalPence: parsePence(total),
      eligiblePence: parsePence(eligible),
      gratuityPence: parsePence(gratuity),
      location: location.trim() || null,
      businessReason: reason.trim() || null,
      mealContext: meal || null,
      category: category || null,
      alcoholReviewed,
      duplicateReviewed,
      reconciliationReviewed,
    };
    if (tripDecision === "selected") review.tripId = tripId;
    if (tripDecision === "leave_unlinked") {
      review.tripId = null;
      review.leaveTripUnlinked = true;
    }
    return review;
  }

  function acceptSavedTrip(updated: ReceiptIntake) {
    setTripId(updated.tripId ?? "");
    setTripDecision("unchanged");
  }

  function validate() {
    return validateIntakeReview({
      merchant,
      date,
      location,
      reason,
      total,
      eligible,
      gratuity,
    });
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const issue = validate();
    if (issue) {
      setMessage(issue);
      return null;
    }
    setBusy("saving");
    setMessage("");
    try {
      const updated = await patchIntake(intake.id, fields());
      onUpdate(updated);
      acceptSavedTrip(updated);
      setMessage("Review saved.");
      return updated;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Review could not be saved.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function confirm() {
    const issue = validate();
    if (issue) {
      setMessage(issue);
      return;
    }
    setBusy("confirming");
    setMessage("");
    try {
      const saved = await patchIntake(intake.id, fields());
      onUpdate(saved);
      acceptSavedTrip(saved);
      const updated = await confirmIntake(intake.id, true);
      onUpdate(updated);
      await onConfirmed();
      setMessage("Expense confirmed and added to your ledger.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Expense could not be confirmed.");
    } finally {
      setBusy("");
    }
  }

  async function afterSaving(action: () => Promise<void>) {
    setBusy("saving");
    setMessage("Saving your current corrections before the re-check…");
    try {
      const updated = await patchIntake(intake.id, fields());
      onUpdate(updated);
      acceptSavedTrip(updated);
      await action();
      setMessage("Corrections saved and re-check completed.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Your corrections could not be saved before the re-check.",
      );
    } finally {
      setBusy("");
    }
  }

  const preview =
    intake.previewUrl ||
    `/api/receipt-intakes/${encodeURIComponent(intake.id)}/image`;
  const locked = intake.status === "confirmed";
  const reconciliation = reconcileReceipt(
    intake.lineItems,
    parsePence(total),
    parsePence(eligible),
    parsePence(gratuity),
  );
  const duplicateBlocked =
    intake.duplicateCandidates.length > 0 && !duplicateReviewed;
  const reconciliationBlocked =
    reconciliation.status === "mismatch" && !reconciliationReviewed;

  return (
    <div className="intake-review">
      <ReceiptImageAdjuster
        previewUrl={preview}
        merchant={intake.merchant}
        byteSize={intake.byteSize}
        aiModel={intake.aiModel}
        initialEdits={intake.imageEdits}
        busy={analysisBusy || Boolean(busy)}
        canAnalyse={canReanalyse}
        onAnalyse={(edits) =>
          void afterSaving(() => onAnalyseWithEdits(edits))
        }
      />

      <form className="intake-review-form" onSubmit={(event) => void save(event)}>
        <header>
          <div>
            <p className="eyebrow">Confirm the facts</p>
            <h3>{intake.merchant || "Receipt details"}</h3>
          </div>
          {intake.uncertainFields.length ? (
            <span>{intake.uncertainFields.length} uncertain</span>
          ) : null}
        </header>

        <ReceiptReviewStatus
          canReanalyse={canReanalyse}
          analysisModel={analysisModel}
          error={intake.error}
          canRetryAnalysis={canRetryAnalysis}
          alcoholSuspected={intake.alcoholSuspected}
          alcoholReviewed={alcoholReviewed}
          locked={locked}
          onReadAgain={() => void afterSaving(() => onReanalyse([]))}
          onRetryAnalysis={() => void afterSaving(onRetryAnalysis)}
          onAlcoholReviewed={setAlcoholReviewed}
        />
        {voiceAvailable ? (
          <VoiceClarification intake={intake} onUpdate={onUpdate} />
        ) : intake.clarificationQuestions.length ? (
          <p className="typed-fallback">
            Voice is unavailable. Type the missing details below.
          </p>
        ) : null}

        <ReceiptFactSummary intake={intake} />
        <IntakeOptionalContext
          data={data}
          reason={reason}
          tripId={tripId}
          tripMatchStatus={intake.tripMatchStatus}
          tripMatchException={intake.tripMatchException}
          tripDecision={tripDecision}
          locked={locked}
          reasonFlagged={flagged("businessReason")}
          reasonConfidence={confidence("businessReason")}
          canReanalyse={canReanalyse}
          busy={analysisBusy || Boolean(busy)}
          onReasonChange={setReason}
          onTripChange={(value) => {
            setTripId(value);
            setTripDecision(value ? "selected" : "leave_unlinked");
          }}
          onLeaveTripUnlinked={() => {
            setTripId("");
            setTripDecision("leave_unlinked");
          }}
          onReasonRecheck={() =>
            void afterSaving(() => onReanalyse(["business_reason"]))
          }
        />

        <details
          className="intake-fact-details"
          open={
            intake.missingFields.length > 0 ||
            intake.uncertainFields.length > 0
          }
        >
          <summary>Review extracted receipt facts</summary>
        <div className="intake-field-grid">
          <label className={flagged("merchant") ? "flagged" : ""}>
            <span>Merchant <small>{confidence("merchant")}</small>
              {canReanalyse ? <button type="button" className="field-reread" disabled={analysisBusy || Boolean(busy)} onClick={() => void afterSaving(() => onReanalyse(["merchant"]))}>Recheck</button> : null}
            </span>
            <input data-intake-review-field="merchant" value={merchant} onChange={(event) => setMerchant(event.target.value)} disabled={locked} />
          </label>
          <label className={flagged("serviceDate") ? "flagged" : ""}>
            <span>Date {intake.transactionTime ? `· ${intake.transactionTime}` : ""} <small>{confidence("serviceDate")}</small>
              {canReanalyse ? <button type="button" className="field-reread" disabled={analysisBusy || Boolean(busy)} onClick={() => void afterSaving(() => onReanalyse(["service_date"]))}>Recheck</button> : null}
            </span>
            <input data-intake-review-field="serviceDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={locked} />
          </label>
          <label className={flagged("receiptTotalPence") ? "flagged" : ""}>
            <span>Receipt total <small>{confidence("receiptTotalPence")}</small>
              {canReanalyse ? <button type="button" className="field-reread" disabled={analysisBusy || Boolean(busy)} onClick={() => void afterSaving(() => onReanalyse(["receipt_total"]))}>Recheck</button> : null}
            </span>
            <div className="intake-money"><b>£</b><input data-intake-review-field="receiptTotalPence" inputMode="decimal" value={total} onChange={(event) => { setTotal(event.target.value); setReconciliationReviewed(false); }} disabled={locked} /></div>
          </label>
          <label className={flagged("category") ? "flagged" : ""}>
            <span>Category <small>{confidence("category")}</small>
              {canReanalyse ? <button type="button" className="field-reread" disabled={analysisBusy || Boolean(busy)} onClick={() => void afterSaving(() => onReanalyse(["category"]))}>Recheck</button> : null}
            </span>
            <select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory | "")} disabled={locked}>
              <option value="">Not labelled</option>
              {EXPENSE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={flagged("eligiblePence") ? "flagged" : ""}>
            <span>{category && category !== "food" ? "Eligible amount" : "Eligible food and drink"} <small>{confidence("eligiblePence")}</small>
              {canReanalyse ? <button type="button" className="field-reread" disabled={analysisBusy || Boolean(busy)} onClick={() => void afterSaving(() => onReanalyse(["eligible_amount"]))}>Recheck</button> : null}
            </span>
            <div className="intake-money"><b>£</b><input data-intake-review-field="eligiblePence" inputMode="decimal" value={eligible} onChange={(event) => { setEligible(event.target.value); setReconciliationReviewed(false); }} disabled={locked} /></div>
          </label>
          <label>
            <span>Service charge or tip</span>
            <div className="intake-money"><b>£</b><input inputMode="decimal" value={gratuity} onChange={(event) => { setGratuity(event.target.value); setReconciliationReviewed(false); }} disabled={locked} /></div>
          </label>
          <label className={flagged("location") ? "flagged" : ""}>
            <span>Location <small>{confidence("location")}</small></span>
            <input data-intake-review-field="location" value={location} onChange={(event) => setLocation(event.target.value)} disabled={locked} />
          </label>
          {!category || category === "food" ? (
            <label>
              <span>Meal context <small>{confidence("mealContext")}</small></span>
              <select value={meal} onChange={(event) => setMeal(event.target.value as MealContext)} disabled={locked}>
                <option value="">Not labelled</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Evening meal</option><option value="snack">Snack</option><option value="mixed">Mixed</option>
              </select>
            </label>
          ) : null}
        </div>
        </details>

        <ReceiptLineItems items={intake.lineItems} />

        <ReconciliationCard
          lineItems={intake.lineItems}
          receiptTotalPence={parsePence(total)}
          eligiblePence={parsePence(eligible)}
          gratuityPence={parsePence(gratuity)}
          reviewed={reconciliationReviewed}
          onReviewed={setReconciliationReviewed}
          locked={locked}
        />
        <DuplicateReview
          candidates={intake.duplicateCandidates}
          reviewed={duplicateReviewed}
          onReviewed={setDuplicateReviewed}
          locked={locked}
        />
        <CorrectionHistory entries={intake.analysisHistory} />

        {message ? <p className="review-message" role="status">{message}</p> : null}
        {!locked ? (
          <ReceiptConfirmationActions
            busy={busy}
            blocked={
              duplicateBlocked ||
              reconciliationBlocked ||
              (intake.tripMatchStatus === "ambiguous" &&
                tripDecision === "unchanged") ||
              (intake.alcoholSuspected && !alcoholReviewed)
            }
            onConfirm={() => void confirm()}
          />
        ) : (
          <p className="confirmed-note">Confirmed and safely added to your expense ledger.</p>
        )}
      </form>
    </div>
  );
}
