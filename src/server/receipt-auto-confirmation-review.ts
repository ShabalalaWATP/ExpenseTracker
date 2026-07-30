const REVIEW_MESSAGE: Record<string, string> = {
  required_fields: "Some required receipt facts still need review.",
  confidence: "One or more receipt facts need a confidence check.",
  arithmetic: "The printed items and totals need an arithmetic check.",
  alcohol: "Possible alcohol must be reviewed by the owner.",
  duplicate: "A possible duplicate receipt needs review.",
  acknowledgement: "This receipt needs owner confirmation after review.",
  currency: "The receipt currency could not be confirmed as GBP.",
  country: "The purchase could not be confirmed as taking place in the UK.",
  trip_ambiguous: "More than one confirmed eligible trip matches this date.",
  trip_invalid: "The selected trip is no longer available.",
  owner_evidence:
    "Receipt evidence changed by the owner must be confirmed manually.",
  verification_unavailable:
    "The independent receipt verification was unavailable.",
  verification_mismatch:
    "The independent receipt check did not exactly match the extracted totals or date.",
  verification_evidence:
    "The independent receipt check did not find enough visible evidence.",
  verification_unsafe:
    "The image could not be treated as a safe, genuine receipt automatically.",
};

export function autoConfirmationReviewMessage(
  reasons: readonly string[],
): string {
  return (
    reasons
      .map((reason) => REVIEW_MESSAGE[reason])
      .filter(Boolean)
      .join(" ") || "Review this receipt before adding it to the ledger."
  );
}
