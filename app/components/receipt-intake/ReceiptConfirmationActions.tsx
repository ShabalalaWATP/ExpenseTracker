"use client";

export function ReceiptConfirmationActions({
  busy,
  blocked,
  onConfirm,
}: {
  busy: "saving" | "confirming" | "";
  blocked: boolean;
  onConfirm: () => void;
}) {
  return (
    <>
      <p className="confirmation-attestation">
        By confirming, I attest that the receipt facts, claim context and
        amounts are accurate.
      </p>
      <div className="review-actions">
        <button type="submit" className="review-save" disabled={Boolean(busy)}>
          {busy === "saving" ? "Saving…" : "Save review"}
        </button>
        <button
          type="button"
          className="review-confirm"
          disabled={blocked || Boolean(busy)}
          onClick={onConfirm}
        >
          {busy === "confirming" ? "Confirming…" : "Confirm expense"}
        </button>
      </div>
    </>
  );
}
