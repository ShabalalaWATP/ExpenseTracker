"use client";

export function ReceiptReviewStatus({
  canReanalyse,
  analysisModel,
  error,
  canRetryAnalysis,
  alcoholSuspected,
  alcoholReviewed,
  locked,
  onReadAgain,
  onRetryAnalysis,
  onAlcoholReviewed,
}: {
  canReanalyse: boolean;
  analysisModel: string;
  error: string | null;
  canRetryAnalysis: boolean;
  alcoholSuspected: boolean;
  alcoholReviewed: boolean;
  locked: boolean;
  onReadAgain: () => void;
  onRetryAnalysis: () => void;
  onAlcoholReviewed: (reviewed: boolean) => void;
}) {
  return (
    <>
      {canReanalyse ? (
        <div className="review-reread">
          <p>
            Need a better result? Re-read the secured image with{" "}
            {analysisModel || "the current receipt model"}. Manual corrections
            remain unchanged unless you recheck that field.
          </p>
          <button type="button" onClick={onReadAgain}>
            Read receipt again
          </button>
        </div>
      ) : null}
      {alcoholSuspected ? (
        <div className="alcohol-warning" role="alert">
          <strong>Possible alcohol detected</strong>
          <span>
            Check that the eligible amount excludes every alcoholic item.
          </span>
          <label>
            <input
              type="checkbox"
              checked={alcoholReviewed}
              onChange={(event) => onAlcoholReviewed(event.target.checked)}
              disabled={locked}
            />
            I checked the receipt and excluded all alcohol.
          </label>
        </div>
      ) : null}
      {error ? (
        <div className="review-error">
          <p>{error}</p>
          {canRetryAnalysis ? (
            <button type="button" onClick={onRetryAnalysis}>
              Retry reading
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
