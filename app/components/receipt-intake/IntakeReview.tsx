"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { parsePence } from "../format";
import type { DashboardData, MealContext } from "../types";
import { confirmIntake, patchIntake } from "./receiptApi";
import type { IntakePatch, ReceiptIntake } from "./types";
import { VoiceClarification } from "./VoiceClarification";

function pounds(pence: number | null) {
  return pence === null ? "" : (pence / 100).toFixed(2);
}

export function IntakeReview({
  intake,
  data,
  voiceAvailable,
  canRetryAnalysis,
  onUpdate,
  onRetryAnalysis,
  onConfirmed,
}: {
  intake: ReceiptIntake;
  data: DashboardData;
  voiceAvailable: boolean;
  canRetryAnalysis: boolean;
  onUpdate: (next: ReceiptIntake) => void;
  onRetryAnalysis: () => void;
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
  const [tripId, setTripId] = useState(intake.tripId ?? "");
  const [alcoholReviewed, setAlcoholReviewed] = useState(intake.alcoholReviewed);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<"saving" | "confirming" | "">("");
  const [message, setMessage] = useState("");

  const flagged = (field: string) =>
    intake.missingFields.includes(
      {
        serviceDate: "service_date",
        receiptTotalPence: "receipt_total",
        eligiblePence: "eligible_amount",
        businessReason: "business_reason",
      }[field] ?? field,
    ) ||
    intake.uncertainFields.includes(
      {
        serviceDate: "service_date",
        receiptTotalPence: "receipt_total",
        eligiblePence: "eligible_amount",
        businessReason: "business_reason",
      }[field] ?? field,
    );
  const confidence = (field: string) => {
    const value =
      intake.confidence[
        {
          serviceDate: "serviceDate",
          receiptTotalPence: "receiptTotal",
          eligiblePence: "eligibleAmount",
        }[field] ?? field
      ] ??
      intake.confidence[
        {
          serviceDate: "service_date",
          receiptTotalPence: "receipt_total",
          eligiblePence: "eligible_amount",
        }[field] ?? field
      ];
    return typeof value === "number"
      ? `${Math.round(value <= 1 ? value * 100 : value)}%`
      : "";
  };

  function fields(): IntakePatch {
    return {
      merchant: merchant.trim() || null,
      serviceDate: date || null,
      receiptTotalPence: parsePence(total),
      eligiblePence: parsePence(eligible),
      gratuityPence: parsePence(gratuity),
      location: location.trim() || null,
      businessReason: reason.trim() || null,
      mealContext: meal || null,
      tripId: tripId || null,
      alcoholReviewed,
    };
  }

  function validate() {
    const receiptTotal = parsePence(total);
    const eligibleTotal = parsePence(eligible);
    const gratuityTotal = parsePence(gratuity);
    if (!merchant.trim() || !date || !location.trim() || !reason.trim()) {
      return "Complete the merchant, date, location and business reason.";
    }
    if (!receiptTotal || receiptTotal < 1 || !eligibleTotal || eligibleTotal < 1) {
      return "Enter valid receipt and eligible totals.";
    }
    if (!Number.isSafeInteger(gratuityTotal) || gratuityTotal < 0) {
      return "Enter a valid service charge or tip.";
    }
    if (eligibleTotal > receiptTotal) {
      return "The eligible amount cannot exceed the receipt total.";
    }
    if (gratuityTotal > eligibleTotal) {
      return "The service charge or tip cannot exceed the eligible amount.";
    }
    return "";
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
      await patchIntake(intake.id, fields());
      const updated = await confirmIntake(intake.id);
      onUpdate(updated);
      await onConfirmed();
      setMessage("Expense confirmed and added to your ledger.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Expense could not be confirmed.");
    } finally {
      setBusy("");
    }
  }

  const preview =
    intake.previewUrl ||
    `/api/receipt-intakes/${encodeURIComponent(intake.id)}/image`;
  const locked = intake.status === "confirmed";

  return (
    <div className="intake-review">
      <aside className="review-receipt">
        <div className="review-image">
          <Image src={preview} alt="Original receipt" fill unoptimized sizes="420px" />
        </div>
        <p>
          Original secured · {(intake.byteSize / 1_048_576).toFixed(1)} MB
          {intake.aiModel ? ` · Read by ${intake.aiModel}` : ""}
        </p>
      </aside>

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

        {intake.alcoholSuspected ? (
          <div className="alcohol-warning" role="alert">
            <strong>Possible alcohol detected</strong>
            <span>Check that the eligible amount excludes every alcoholic item.</span>
            <label>
              <input
                type="checkbox"
                checked={alcoholReviewed}
                onChange={(event) => setAlcoholReviewed(event.target.checked)}
                disabled={locked}
              />
              I checked the receipt and excluded all alcohol.
            </label>
          </div>
        ) : null}
        {intake.error ? (
          <div className="review-error">
            <p>{intake.error}</p>
            {canRetryAnalysis ? (
              <button type="button" onClick={onRetryAnalysis}>Retry reading</button>
            ) : null}
          </div>
        ) : null}
        {voiceAvailable ? (
          <VoiceClarification intake={intake} onUpdate={onUpdate} />
        ) : intake.clarificationQuestions.length ? (
          <p className="typed-fallback">
            Voice is unavailable. Type the missing details below.
          </p>
        ) : null}

        <div className="intake-field-grid">
          <label className={flagged("merchant") ? "flagged" : ""}>
            <span>Merchant <small>{confidence("merchant")}</small></span>
            <input data-intake-review-field="merchant" value={merchant} onChange={(event) => setMerchant(event.target.value)} disabled={locked} />
          </label>
          <label className={flagged("serviceDate") ? "flagged" : ""}>
            <span>Date <small>{confidence("serviceDate")}</small></span>
            <input data-intake-review-field="serviceDate" type="date" value={date} onChange={(event) => setDate(event.target.value)} disabled={locked} />
          </label>
          <label className={flagged("receiptTotalPence") ? "flagged" : ""}>
            <span>Receipt total <small>{confidence("receiptTotalPence")}</small></span>
            <div className="intake-money"><b>£</b><input data-intake-review-field="receiptTotalPence" inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} disabled={locked} /></div>
          </label>
          <label className={flagged("eligiblePence") ? "flagged" : ""}>
            <span>Eligible food and drink <small>{confidence("eligiblePence")}</small></span>
            <div className="intake-money"><b>£</b><input data-intake-review-field="eligiblePence" inputMode="decimal" value={eligible} onChange={(event) => setEligible(event.target.value)} disabled={locked} /></div>
          </label>
          <label>
            <span>Service charge or tip</span>
            <div className="intake-money"><b>£</b><input inputMode="decimal" value={gratuity} onChange={(event) => setGratuity(event.target.value)} disabled={locked} /></div>
          </label>
          <label className={flagged("location") ? "flagged" : ""}>
            <span>Location <small>{confidence("location")}</small></span>
            <input data-intake-review-field="location" value={location} onChange={(event) => setLocation(event.target.value)} disabled={locked} />
          </label>
          <label className={`wide ${flagged("businessReason") ? "flagged" : ""}`}>
            <span>Why was it necessary?</span>
            <textarea data-intake-review-field="businessReason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} disabled={locked} />
          </label>
          <label>
            <span>Meal context</span>
            <select value={meal} onChange={(event) => setMeal(event.target.value as MealContext)} disabled={locked}>
              <option value="">Not labelled</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Evening meal</option><option value="snack">Snack</option><option value="mixed">Mixed</option>
            </select>
          </label>
          <label>
            <span>Trip</span>
            <select value={tripId} onChange={(event) => setTripId(event.target.value)} disabled={locked}>
              <option value="">No linked trip</option>
              {data.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
            </select>
          </label>
        </div>

        {intake.lineItems.length ? (
          <details className="line-items">
            <summary>{intake.lineItems.length} receipt items</summary>
            <ul>
              {intake.lineItems.map((item, index) => (
                <li key={`${item.description}-${index}`}>
                  <span>{(item.quantity ?? 0) > 1 ? `${item.quantity} × ` : ""}{item.description}</span>
                  {item.alcoholSuspected ? <em>Check alcohol</em> : null}
                  <strong>{item.totalPence === null ? "—" : `£${(item.totalPence / 100).toFixed(2)}`}</strong>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {!locked ? (
          <label className="review-attestation">
            <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
            <span>I checked the receipt details and amounts.</span>
          </label>
        ) : null}
        {message ? <p className="review-message" role="status">{message}</p> : null}
        {!locked ? (
          <div className="review-actions">
            <button type="submit" className="review-save" disabled={Boolean(busy)}>
              {busy === "saving" ? "Saving…" : "Save review"}
            </button>
            <button type="button" className="review-confirm" disabled={!reviewed || (intake.alcoholSuspected && !alcoholReviewed) || Boolean(busy)} onClick={() => void confirm()}>
              {busy === "confirming" ? "Confirming…" : "Confirm expense"}
            </button>
          </div>
        ) : (
          <p className="confirmed-note">Confirmed and safely added to your expense ledger.</p>
        )}
      </form>
    </div>
  );
}
