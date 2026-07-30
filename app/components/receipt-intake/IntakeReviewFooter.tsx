import { ReceiptConfirmationActions } from "./ReceiptConfirmationActions";

export function IntakeReviewFooter({
  message,
  locked,
  busy,
  blocked,
  onConfirm,
}: {
  message: string;
  locked: boolean;
  busy: "saving" | "confirming" | "";
  blocked: boolean;
  onConfirm: () => void;
}) {
  return (
    <>
      {message ? (
        <p className="review-message" role="status">
          {message}
        </p>
      ) : null}
      {!locked ? (
        <ReceiptConfirmationActions
          busy={busy}
          blocked={blocked}
          onConfirm={onConfirm}
        />
      ) : (
        <p className="confirmed-note">
          Confirmed and safely added to your expense ledger.
        </p>
      )}
    </>
  );
}
