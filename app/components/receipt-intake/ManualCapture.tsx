"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createExpense, uploadReceipt } from "../api";
import { localDate, parsePence } from "../format";
import {
  EXPENSE_CATEGORY_OPTIONS,
  type DashboardData,
  type ExpenseCategory,
  type MealContext,
} from "../types";
import { Field, StatusMessage } from "../ui";

type SaveStage = "idle" | "creating" | "uploading" | "saved" | "failed";

export function ManualCapture({
  data,
  initialDate,
  onSaved,
}: {
  data: DashboardData;
  initialDate?: string;
  onSaved: () => Promise<void>;
}) {
  const dateSeed = initialDate ?? "";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [receiptUnavailable, setReceiptUnavailable] = useState(false);
  const [dateState, setDateState] = useState(() => ({
    seed: dateSeed,
    value: initialDate ?? localDate(),
  }));
  const date =
    dateState.seed === dateSeed
      ? dateState.value
      : (initialDate ?? localDate());
  const setDate = (value: string) =>
    setDateState({ seed: dateSeed, value });
  const [merchant, setMerchant] = useState("");
  const [receiptTotal, setReceiptTotal] = useState("");
  const [eligibleAmount, setEligibleAmount] = useState("");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [mealContext, setMealContext] = useState<MealContext>("");
  const [category, setCategory] = useState<ExpenseCategory>("food");
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
    if (!receiptUnavailable && !file) {
      return "Choose a receipt photo, or mark the receipt as unavailable.";
    }
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

  async function finishWithoutReceipt() {
    setStage("saved");
    setPendingExpenseId("");
    uploadKeyRef.current = "";
    try {
      await onSaved();
    } catch {
      setError(
        "The expense was saved, but the list could not refresh. Reload the app before trying again.",
      );
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
      if (pendingExpenseId) {
        if (receiptUnavailable) return await finishWithoutReceipt();
        return await sendReceipt(pendingExpenseId);
      }
      setStage("creating");
      const expense = await createExpense({
        date,
        merchant: merchant.trim(),
        receiptTotalPence: parsePence(receiptTotal),
        eligibleAmountPence: parsePence(eligibleAmount),
        country: "GB",
        location: location.trim(),
        reason: reason.trim(),
        mealContext: category === "food" ? mealContext : "",
        category,
        tripId: tripId || undefined,
      });
      if (receiptUnavailable) {
        return await finishWithoutReceipt();
      }
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
    setDate(initialDate ?? localDate());
    setMerchant("");
    setReceiptTotal("");
    setEligibleAmount("");
    setLocation("");
    setReason("");
    setMealContext("");
    setCategory("food");
    setTripId("");
    setReceiptUnavailable(false);
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
          <strong>
            {receiptUnavailable
              ? "Missing-receipt expense recorded"
              : "Receipt safely stored"}
          </strong>
          <p>
            {receiptUnavailable
              ? "It is marked Receipt needed in Expenses, where you can attach the evidence later."
              : "The expense and original receipt were acknowledged."}
          </p>
          <button className="text-button" type="button" onClick={reset}>Capture another</button>
        </StatusMessage>
      ) : null}
      <form className="capture-layout" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <section className="photo-well" aria-label="Receipt photo">
          {receiptUnavailable ? (
            <div className="camera-prompt receipt-unavailable">
              <span aria-hidden="true">!</span>
              <strong>Receipt unavailable</strong>
              <p>The expense will remain clearly marked until evidence is attached.</p>
            </div>
          ) : preview ? (
            <div className="receipt-preview"><Image src={preview} alt="Selected receipt preview" fill unoptimized /></div>
          ) : (
            <div className="camera-prompt"><span aria-hidden="true">＋</span><strong>Add receipt photo</strong><p>Camera or Photo Library</p></div>
          )}
          {!receiptUnavailable ? (
            <label className="file-button">
              <span>{preview ? "Retake or reselect" : "Open camera"}</span>
              <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
            </label>
          ) : null}
          <label className="receipt-unavailable-toggle">
            <input
              type="checkbox"
              checked={receiptUnavailable}
              disabled={busy || stage === "saved"}
              onChange={(event) => {
                const unavailable = event.target.checked;
                if (unavailable) {
                  if (preview) URL.revokeObjectURL(preview);
                  setFile(null);
                  setPreview("");
                  uploadKeyRef.current = "";
                  setStage("idle");
                  setError("");
                }
                setReceiptUnavailable(unavailable);
              }}
            />
            <span>
              <strong>I do not have the receipt</strong>
              <small>Save the expense now and keep it marked as missing evidence.</small>
            </span>
          </label>
          {file ? <p className="file-detail">{file.name} · {(file.size / 1_048_576).toFixed(1)} MB</p> : null}
        </section>
        <section className="review-form" aria-labelledby="manual-review-heading">
          <div className="section-heading"><div><p className="eyebrow">Review</p><h2 id="manual-review-heading">Expense details</h2></div><span className="required-key">* Required</span></div>
          <div className="form-grid">
            <Field label="Date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
            <Field label="Merchant" required><input autoComplete="organization" value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="For example, Pret A Manger" required /></Field>
            <Field label="Receipt total" required hint="Including any in-bill service charge."><div className="money-input"><span>£</span><input inputMode="decimal" value={receiptTotal} onChange={(event) => setReceiptTotal(event.target.value)} placeholder="0.00" required /></div></Field>
            <Field label="Category" required><select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label="Eligible amount" required hint={category === "food" ? "Food and non-alcoholic drink only." : "The full fare or fee for this duty expense."}><div className="money-input"><span>£</span><input inputMode="decimal" value={eligibleAmount} onChange={(event) => setEligibleAmount(event.target.value)} placeholder="0.00" required /></div></Field>
            <Field label="Country" required><input value="United Kingdom (GB)" readOnly aria-readonly="true" /></Field>
            <Field label="Location" required><input autoComplete="address-level2" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Town, venue or duty station" required /></Field>
            <Field label="Why was it necessary?" required><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Directly related to authorised duty…" rows={3} required /></Field>
            {category === "food" ? <Field label="Meal context"><select value={mealContext} onChange={(event) => setMealContext(event.target.value as MealContext)}><option value="">Not labelled</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Evening meal</option><option value="snack">Snack</option><option value="mixed">Mixed</option></select></Field> : null}
            <Field label="Trip"><select value={tripId} onChange={(event) => setTripId(event.target.value)}><option value="">No linked trip</option>{data.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></Field>
          </div>
          <div className="form-actions">
            {stage === "failed" && pendingExpenseId ? <button className="secondary-button" type="button" onClick={() => void sendReceipt()} disabled={!file}>Retry receipt upload</button> : null}
            <button className="primary-button" type="submit" disabled={busy || stage === "saved"}>{stage === "creating" ? "Creating expense…" : stage === "uploading" ? "Uploading receipt…" : receiptUnavailable ? "Save as receipt needed" : "Save expense"}</button>
          </div>
          {busy ? <p className="upload-note" role="status">{stage === "creating" ? "Creating the financial record. The receipt is not stored yet." : "Uploading the original receipt. Keep this page open until confirmed."}</p> : null}
        </section>
      </form>
    </div>
  );
}
