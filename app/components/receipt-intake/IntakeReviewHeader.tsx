import { ReceiptReviewStatus } from "./ReceiptReviewStatus";
import type { ReceiptIntake } from "./types";
import { VoiceClarification } from "./VoiceClarification";

export function IntakeReviewHeader({
  intake,
  voiceAvailable,
  canRetryAnalysis,
  canReanalyse,
  analysisModel,
  alcoholReviewed,
  locked,
  onUpdate,
  onReadAgain,
  onRetryAnalysis,
  onAlcoholReviewed,
}: {
  intake: ReceiptIntake;
  voiceAvailable: boolean;
  canRetryAnalysis: boolean;
  canReanalyse: boolean;
  analysisModel: string;
  alcoholReviewed: boolean;
  locked: boolean;
  onUpdate: (next: ReceiptIntake) => void;
  onReadAgain: () => void;
  onRetryAnalysis: () => void;
  onAlcoholReviewed: (value: boolean) => void;
}) {
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">Review exception</p>
          <h3>
            {intake.translation?.merchantEnglish ||
              intake.merchant ||
              "Receipt details"}
          </h3>
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
        onReadAgain={onReadAgain}
        onRetryAnalysis={onRetryAnalysis}
        onAlcoholReviewed={onAlcoholReviewed}
      />
      {voiceAvailable ? (
        <VoiceClarification intake={intake} onUpdate={onUpdate} />
      ) : intake.clarificationQuestions.length ? (
        <p className="typed-fallback">
          Voice is unavailable. Type the missing details below.
        </p>
      ) : null}
    </>
  );
}
