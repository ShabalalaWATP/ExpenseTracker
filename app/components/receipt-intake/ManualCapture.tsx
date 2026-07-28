"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createExpense, uploadReceipt } from "../api";
import { localDate, parsePence } from "../format";
import type { DashboardData, MealContext } from "../types";
import { Field, StatusMessage } from "../ui";

type SaveStage = "idle" | "creating" | "uploading" | "saved" | "failed";

export function ManualCapture({
  data,
  onSaved,
}: {
  data: DashboardData;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [date, setDate] = useState(localDate());
  const [merchant, setMerchant] = useState("");
  const [receiptTotal, setReceiptTotal] = useState("");
  const [eligibleAmount, setEligibleAmount] = useState("");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [mealContext, setMealContext] = useState<MealContext>("");
  const [tripId, setTripId] = useState("");
  const [stage, setStage] = useState<SaveStage>("idle");
  const [error, setError] = useState("");
  const [pendingExpenseId, setPendingExpenseId] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const uploadKeyRef = useRef("");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function selectFile(selected: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(selected ? URL.createObjectURL(selected) : "");
    setPendingExpenseId("");
    uploadKeyRef.current = "";
    setStage("idle");
    setError("");
  }

  function validate() {
    const total = parsePence(receiptTotal);
    const eligible = parsePence(eligibleAmount);
    if (!file) return "Choose or photograph a receipt before saving.";
    if (!date || !merchant.trim() || !location.trim() || !reason.trim()) {
      return "Complete every required field.";
    }
    if (!Number.isSafeInteger(total) || total <= 0) {
      return "Enter a valid receipt total.";
    }
    if (!Number.isSafeInteger(eligible) || eligible <= 0) {
      return "Enter a valid eligible amount.";
    }
    if (eligible > total) {
      return "Eligible amount cannot be more than the receipt total.";
    }
    return "";
  }

  async function sendReceipt(expenseId = pendingExpenseId) {
    if (!file) {
      setStage("failed");
      setError("Reselect the photo to finish this expense.");
      return;
    }
    try {
      setStage("uploading");
      setError("");
      if (!uploadKeyRef.current) uploadKeyRef.current = crypto.randomUUID();
      await uploadReceipt(expenseId, file, uploadKeyRef.current);
      setStage("saved");
      setPendingExpenseId("");
      uploadKeyRef.current = "";
      await onSaved();
    } catch (caught) {
      setStage("failed");
      setError(caught instanceof Error ? caught.message : "Receipt upload failed.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const issue = validate();
    if (issue) {
      setError(issue);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setError("");
    try {
      if (pendingExpenseId) return await sendReceipt(pendingExpenseId);
      setStage("creating");
      const expense = await createExpense({
        date,
        merchant: merchant.trim(),
        receiptTotalPence: parsePence(receiptTotal),
        eligibleAmountPence: parsePence(eligibleAmount),
        country: "GB",
        location: location.trim(),
        reason: reason.trim(),
        mealContext,
        tripId: tripId || undefined,
      });
      setPendingExpenseId(expense.id);
      await sendReceipt(expense.id);
    } catch (caught) {
      setStage("failed");
      setError(caught instanceof Error ? caught.message : "The expense could not be saved.");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  function reset() {
    selectFile(null);
    setDate(localDate());
    setMerchant("");
    setReceiptTotal("");
    setEligibleAmount("");
    setLocation("");
    setReason("");
    setMealContext("");
    setTripId("");
  }

  const busy = stage === "creating" || stage === "uploading";
  return (
    <div className="manual-capture">
      <div className="manual-intro">
        <p className="eyebrow">Manual entry</p>
        <h2>Enter one expense yourself</h2>
        <p>Use this when you want to enter every receipt fact without automatic reading.</p>
      </div>
      {error ? (
        <div ref={errorRef} tabIndex={-1}>
          <StatusMessage tone="error"><strong>Could not finish saving</strong><p>{error}</p></StatusMessage>
        </div>
      ) : null}
      {stage === "saved" ? (
        <StatusMessage tone="success">
          <strong>Receipt safely stored</strong>
          <p>The expense and original receipt were acknowledged.</p>
          <button className="text-button" type="button" onClick={reset}>Capture another</button>
        </StatusMessage>
      ) : null}
      <form className="capture-layout" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <section className="photo-well" aria-label="Receipt photo">
          {preview ? (
            <div className="receipt-preview"><Image src={preview} alt="Selected receipt preview" fill unoptimized /></div>
          ) : (
            <div className="camera-prompt"><span aria-hidden="true">＋</span><strong>Add receipt photo</strong><p>Camera or Photo Library</p></div>
          )}
          <label className="file-button">
            <span>{preview ? "Retake or reselect" : "Open camera"}</span>
            <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
          </label>
          {file ? <p className="file-detail">{file.name} · {(file.size / 1_048_576).toFixed(1)} MB</p> : null}
        </section>
        <section className="review-form" aria-labelledby="manual-review-heading">
          <div className="section-heading"><div><p className="eyebrow">Review</p><h2 id="manual-review-heading">Expense details</h2></div><span className="required-key">* Required</span></div>
          <div className="form-grid">
            <Field label="Date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
            <Field label="Merchant" required><input autoComplete="organization" value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="For example, Pret A Manger" required /></Field>
            <Field label="Receipt total" required hint="Including any in-bill service charge."><div className="money-input"><span>£</span><input inputMode="decimal" value={receiptTotal} onChange={(event) => setReceiptTotal(event.target.value)} placeholder="0.00" required /></div></Field>
            <Field label="Eligible amount" required hint="Food and non-alcoholic drink only."><div className="money-input"><span>£</span><input inputMode="decimal" value={eligibleAmount} onChange={(event) => setEligibleAmount(event.target.value)} placeholder="0.00" required /></div></Field>
            <Field label="Country" required><input value="United Kingdom (GB)" readOnly aria-readonly="true" /></Field>
            <Field label="Location" required><input autoComplete="address-level2" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Town, venue or duty station" required /></Field>
            <Field label="Why was it necessary?" required><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Directly related to authorised duty…" rows={3} required /></Field>
            <Field label="Meal context"><select value={mealContext} onChange={(event) => setMealContext(event.target.value as MealContext)}><option value="">Not labelled</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Evening meal</option><option value="snack">Snack</option><option value="mixed">Mixed</option></select></Field>
            <Field label="Trip"><select value={tripId} onChange={(event) => setTripId(event.target.value)}><option value="">No linked trip</option>{data.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></Field>
          </div>
          <div className="form-actions">
            {stage === "failed" && pendingExpenseId ? <button className="secondary-button" type="button" onClick={() => void sendReceipt()} disabled={!file}>Retry receipt upload</button> : null}
            <button className="primary-button" type="submit" disabled={busy || stage === "saved"}>{stage === "creating" ? "Creating expense…" : stage === "uploading" ? "Uploading receipt…" : "Save expense"}</button>
          </div>
          {busy ? <p className="upload-note" role="status">{stage === "creating" ? "Creating the financial record. The receipt is not stored yet." : "Uploading the original receipt. Keep this page open until confirmed."}</p> : null}
        </section>
      </form>
    </div>
  );
}
