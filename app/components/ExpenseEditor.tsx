"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { deleteExpense, updateExpense } from "./api";
import { parsePence, penceInput } from "./format";
import type { Expense, MealContext, Trip } from "./types";
import { Field, StatusMessage } from "./ui";

export function ExpenseEditor({
  expense,
  trips,
  onClose,
  onChanged,
}: {
  expense: Expense;
  trips: Trip[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [date, setDate] = useState(expense.date);
  const [merchant, setMerchant] = useState(expense.merchant);
  const [total, setTotal] = useState(penceInput(expense.receiptTotalPence));
  const [eligible, setEligible] = useState(penceInput(expense.eligibleAmountPence));
  const [gratuity, setGratuity] = useState(
    penceInput(expense.gratuityPence ?? 0),
  );
  const [location, setLocation] = useState(expense.location);
  const [reason, setReason] = useState(expense.reason);
  const [mealContext, setMealContext] = useState<MealContext>(
    expense.mealContext ?? "",
  );
  const [tripId, setTripId] = useState(expense.tripId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    const totalPence = parsePence(total);
    const eligiblePence = parsePence(eligible);
    const gratuityPence = parsePence(gratuity);
    if (
      !merchant.trim() ||
      !date ||
      !location.trim() ||
      !reason.trim() ||
      totalPence <= 0 ||
      eligiblePence <= 0 ||
      eligiblePence > totalPence ||
      gratuityPence < 0 ||
      gratuityPence > eligiblePence
    ) {
      setError("Check the required fields and make sure the eligible amount does not exceed the total.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateExpense(expense.id, {
        date,
        merchant: merchant.trim(),
        receiptTotalPence: totalPence,
        eligibleAmountPence: eligiblePence,
        gratuityPence,
        country: "GB",
        location: location.trim(),
        reason: reason.trim(),
        mealContext,
        tripId,
      });
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expense could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Move the unsubmitted expense from ${expense.merchant} to Recently deleted? Its receipt will be kept.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteExpense(expense.id);
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The expense could not be deleted.");
      setSaving(false);
    }
  }

  return (
    <div className="editor-panel" role="dialog" aria-modal="true" aria-labelledby="editor-heading">
      <div className="editor-top">
        <div>
          <p className="eyebrow">Expense record</p>
          <h2 id="editor-heading" tabIndex={-1} ref={headingRef}>Edit details</h2>
        </div>
        <button className="round-button" type="button" onClick={onClose} aria-label="Close editor">×</button>
      </div>
      {expense.locked ? (
        <StatusMessage tone="warning">Prepared claim records are frozen. Prepare a correction rather than changing this item.</StatusMessage>
      ) : (
        <form onSubmit={save}>
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          <Field label="Date" required><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <Field label="Merchant" required><input value={merchant} onChange={(event) => setMerchant(event.target.value)} /></Field>
          <div className="two-fields">
            <Field label="Receipt total" required><div className="money-input"><span>£</span><input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} /></div></Field>
            <Field label="Eligible" required><div className="money-input"><span>£</span><input inputMode="decimal" value={eligible} onChange={(event) => setEligible(event.target.value)} /></div></Field>
          </div>
          <Field label="Service charge or tip" hint="Included in the eligible amount and subject to the £30 daily limit."><div className="money-input"><span>£</span><input inputMode="decimal" value={gratuity} onChange={(event) => setGratuity(event.target.value)} /></div></Field>
          <Field label="Location" required><input value={location} onChange={(event) => setLocation(event.target.value)} /></Field>
          <Field label="Why was it necessary?" required><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <div className="two-fields">
            <Field label="Meal context">
              <select value={mealContext} onChange={(event) => setMealContext(event.target.value as MealContext)}>
                <option value="">Not labelled</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Evening meal</option>
                <option value="snack">Snack</option>
                <option value="mixed">Mixed</option>
              </select>
            </Field>
            <Field label="Trip">
              <select value={tripId} onChange={(event) => setTripId(event.target.value)}>
                <option value="">No linked trip</option>
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-actions split">
            <button className="danger-button" type="button" onClick={() => void remove()} disabled={saving}>Move to deleted</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
