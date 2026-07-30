"use client";

import { useState, type FormEvent } from "react";
import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { parsePence } from "../format";
import type { DashboardData, ExpenseCategory, MealContext } from "../types";
import { IntakeEditableFacts } from "./IntakeEditableFacts";
import { IntakeOptionalContext } from "./IntakeOptionalContext";
import { IntakeOriginFallback } from "./IntakeOriginFallback";
import { IntakeReviewEvidence } from "./IntakeReviewEvidence";
import { IntakeReviewFooter } from "./IntakeReviewFooter";
import { IntakeReviewHeader } from "./IntakeReviewHeader";
import { ReceiptFactSummary } from "./ReceiptFactSummary";
import { ReceiptImageAdjuster } from "./ReceiptImageAdjuster";
import {
  buildIntakePatch,
  pounds,
  validateIntakeReview,
} from "./intake-review-validation";
import {
  confidenceLabel,
  fieldFlagged,
} from "./receipt-field-state";
import { confirmIntake, patchIntake } from "./receiptApi";
import type {
  ImageEdits,
  ReceiptIntake,
  ReceiptRecheckField,
} from "./types";

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
  const [category, setCategory] =
    useState<ExpenseCategory | "">(intake.category ?? "");
  const [originalCurrency, setOriginalCurrency] =
    useState(intake.originalCurrency);
  const [originalCountry, setOriginalCountry] =
    useState(intake.originalCountry);
  const [tripId, setTripId] = useState(intake.tripId ?? "");
  const [tripLegId, setTripLegId] = useState(intake.tripLegId ?? "");
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
  const [conversionReviewed, setConversionReviewed] = useState(false);
  const [busy, setBusy] = useState<"saving" | "confirming" | "">("");
  const [message, setMessage] = useState("");

  const flagged = (field: string) => fieldFlagged(intake, field);
  const confidence = (field: string) => confidenceLabel(intake, field);
  const foreignReceipt =
    Boolean(originalCurrency) &&
    originalCurrency !== "GBP" &&
    originalCurrency !== "UNKNOWN";
  const manualConversion =
    foreignReceipt &&
    originalCurrency === intake.originalCurrency &&
    intake.conversion?.status === "unavailable";

  function fields() {
    return buildIntakePatch({
      merchant,
      date,
      total,
      eligible,
      gratuity,
      location,
      reason,
      meal,
      category,
      alcoholReviewed,
      duplicateReviewed,
      reconciliationReviewed,
      conversionReviewed,
      originalCurrency,
      initialCurrency: intake.originalCurrency,
      originalCountry,
      initialCountry: intake.originalCountry,
      tripDecision,
      tripId,
      tripLegId,
    });
  }

  function acceptSaved(updated: ReceiptIntake) {
    setTripId(updated.tripId ?? "");
    setTripLegId(updated.tripLegId ?? "");
    setOriginalCurrency(updated.originalCurrency);
    setOriginalCountry(updated.originalCountry);
    setTotal(pounds(updated.receiptTotalPence));
    setEligible(pounds(updated.eligiblePence));
    setGratuity(pounds(updated.gratuityPence));
    setTripDecision("unchanged");
  }

  function validate(allowOriginResolution = false) {
    return validateIntakeReview({
      merchant,
      date,
      location,
      reason,
      total,
      eligible,
      gratuity,
      allowMissingTotals:
        allowOriginResolution &&
        originalCurrency !== intake.originalCurrency,
    });
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    const issue = validate(true);
    if (issue) {
      setMessage(issue);
      return null;
    }
    setBusy("saving");
    setMessage("");
    try {
      const updated = await patchIntake(intake.id, fields());
      onUpdate(updated);
      acceptSaved(updated);
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
      acceptSaved(saved);
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
      acceptSaved(updated);
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
    intake.originalReceiptTotalMinor ?? parsePence(total),
    intake.originalEligibleMinor ?? parsePence(eligible),
    intake.originalGratuityMinor ?? parsePence(gratuity),
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
        <IntakeReviewHeader
          intake={intake}
          voiceAvailable={voiceAvailable}
          canRetryAnalysis={canRetryAnalysis}
          canReanalyse={canReanalyse}
          analysisModel={analysisModel}
          alcoholReviewed={alcoholReviewed}
          locked={locked}
          onUpdate={onUpdate}
          onReadAgain={() => void afterSaving(() => onReanalyse([]))}
          onRetryAnalysis={() => void afterSaving(onRetryAnalysis)}
          onAlcoholReviewed={setAlcoholReviewed}
        />

        <ReceiptFactSummary intake={intake} />
        <IntakeOriginFallback
          intake={intake}
          currency={originalCurrency}
          country={originalCountry}
          locked={locked}
          onCurrencyChange={setOriginalCurrency}
          onCountryChange={setOriginalCountry}
        />
        <IntakeOptionalContext
          data={data}
          reason={reason}
          tripLegId={tripLegId}
          serviceDate={date}
          originalCountry={originalCountry}
          tripMatchStatus={intake.tripMatchStatus}
          tripMatchException={intake.tripMatchException}
          tripDecision={tripDecision}
          locked={locked}
          reasonFlagged={flagged("businessReason")}
          reasonConfidence={confidence("businessReason")}
          canReanalyse={canReanalyse}
          busy={analysisBusy || Boolean(busy)}
          onReasonChange={setReason}
          onTripChange={(nextTripId, nextTripLegId) => {
            setTripId(nextTripId);
            setTripLegId(nextTripLegId);
            setTripDecision(nextTripId ? "selected" : "leave_unlinked");
          }}
          onLeaveTripUnlinked={() => {
            setTripId("");
            setTripLegId("");
            setTripDecision("leave_unlinked");
          }}
          onReasonRecheck={() =>
            void afterSaving(() => onReanalyse(["business_reason"]))
          }
        />

        <IntakeEditableFacts
          intake={intake}
          values={{
            merchant,
            date,
            total,
            eligible,
            gratuity,
            location,
            category,
            meal,
          }}
          locked={locked}
          busy={analysisBusy || Boolean(busy)}
          canReanalyse={canReanalyse}
          foreignReceipt={foreignReceipt}
          manualConversion={manualConversion}
          conversionReviewed={conversionReviewed}
          flagged={flagged}
          confidence={confidence}
          onChange={{
            merchant: setMerchant,
            date: setDate,
            total: setTotal,
            eligible: setEligible,
            gratuity: setGratuity,
            location: setLocation,
            category: setCategory,
            meal: setMeal,
          }}
          onReconciliationChanged={() => setReconciliationReviewed(false)}
          onConversionReviewed={setConversionReviewed}
          onReanalyse={(fields) =>
            void afterSaving(() => onReanalyse(fields))
          }
        />

        <IntakeReviewEvidence
          intake={intake}
          total={total}
          eligible={eligible}
          gratuity={gratuity}
          reconciliationReviewed={reconciliationReviewed}
          duplicateReviewed={duplicateReviewed}
          locked={locked}
          onReconciliationReviewed={setReconciliationReviewed}
          onDuplicateReviewed={setDuplicateReviewed}
        />

        <IntakeReviewFooter
          message={message}
          locked={locked}
          busy={busy}
          blocked={
            duplicateBlocked ||
            reconciliationBlocked ||
            (manualConversion && !conversionReviewed) ||
            (intake.tripMatchStatus === "ambiguous" &&
              tripDecision === "unchanged") ||
            (intake.alcoholSuspected && !alcoholReviewed)
          }
          onConfirm={() => void confirm()}
        />
      </form>
    </div>
  );
}
