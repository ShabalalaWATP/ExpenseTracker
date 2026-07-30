export const AUTO_CONFIRM_CONFIDENCE = {
  merchant: 0.9,
  serviceDate: 0.95,
  receiptTotal: 0.95,
  eligibleAmount: 0.95,
  location: 0.9,
  businessReason: 0.85,
  category: 0.9,
  transactionTime: 0.85,
  mealContext: 0.85,
  gratuity: 0.9,
  lineItems: 0.9,
} as const;

export const AUTO_VERIFY_CONFIDENCE = {
  serviceDate: 0.98,
  receiptTotal: 0.98,
  eligibleAmount: 0.98,
  currency: 0.98,
  country: 0.98,
  receiptEvidence: 0.98,
} as const;

export type ReceiptAutoVerification = {
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  currency: "GBP" | "UNKNOWN";
  country: "GB" | "UNKNOWN";
  isReceipt: boolean;
  instructionLikeTextDetected: boolean;
  evidence: {
    serviceDateVisible: boolean;
    receiptTotalVisible: boolean;
    eligibleBasisVisible: boolean;
    currencyVisible: boolean;
    countryVisible: boolean;
    merchantOrTaxIdentityVisible: boolean;
  };
  confidence: Record<keyof typeof AUTO_VERIFY_CONFIDENCE, number>;
};

export type AutomaticConfirmationReason =
  | "required_fields"
  | "confidence"
  | "arithmetic"
  | "alcohol"
  | "duplicate"
  | "acknowledgement"
  | "currency"
  | "country"
  | "trip_ambiguous"
  | "trip_invalid"
  | "owner_evidence"
  | "verification_unavailable"
  | "verification_mismatch"
  | "verification_evidence"
  | "verification_unsafe";

export type AutomaticConfirmationInput = {
  merchant: string | null;
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  location: string | null;
  businessReason: string | null;
  category: string | null;
  transactionTime: string | null;
  mealContext: string | null;
  confidence: Partial<Record<keyof typeof AUTO_CONFIRM_CONFIDENCE, number>>;
  unresolvedFields: readonly string[];
  reconciliationStatus: "balanced" | "incomplete" | "mismatch";
  lineItems: readonly {
    totalPence: number | null;
    eligible: boolean | null;
    alcoholSuspected: boolean;
    confidence?: number;
  }[];
  alcoholSuspected: boolean;
  duplicateCount: number;
  acknowledgements: {
    alcohol: boolean;
    duplicate: boolean;
    reconciliation: boolean;
  };
  extractedCurrency: string | null;
  extractedCountry: string | null;
  tripStatus: "explicit" | "matched" | "none" | "ambiguous" | "invalid";
  provenance: Readonly<Record<string, "ai" | "owner" | "auto">>;
  verification: ReceiptAutoVerification | null;
};

function present(value: string | null): boolean {
  return Boolean(value?.trim());
}

function confidenceIsHigh(input: AutomaticConfirmationInput): boolean {
  const required: (keyof typeof AUTO_CONFIRM_CONFIDENCE)[] = [
    "merchant",
    "serviceDate",
    "receiptTotal",
    "eligibleAmount",
    "location",
    "category",
    "gratuity",
    "lineItems",
  ];
  if (input.provenance.business_reason !== "owner") {
    required.push("businessReason");
  }
  if (input.category === "food") {
    required.push("transactionTime", "mealContext");
  }
  return required.every(
    (field) =>
      typeof input.confidence[field] === "number" &&
      input.confidence[field]! >= AUTO_CONFIRM_CONFIDENCE[field],
  );
}

const RECEIPT_EVIDENCE_FIELDS = [
  "merchant",
  "service_date",
  "transaction_time",
  "receipt_total",
  "eligible_amount",
  "location",
  "meal_context",
  "alcohol",
  "category",
  "gratuity",
] as const;

function verificationReasons(
  input: AutomaticConfirmationInput,
): AutomaticConfirmationReason[] {
  const verification = input.verification;
  if (!verification) return ["verification_unavailable"];
  const reasons: AutomaticConfirmationReason[] = [];
  if (
    verification.serviceDate !== input.serviceDate ||
    verification.receiptTotalPence !== input.receiptTotalPence ||
    verification.eligiblePence !== input.eligiblePence ||
    verification.currency !== "GBP" ||
    verification.country !== "GB"
  ) {
    reasons.push("verification_mismatch");
  }
  if (
    !Object.values(verification.evidence).every(Boolean) ||
    Object.entries(AUTO_VERIFY_CONFIDENCE).some(
      ([field, threshold]) =>
        verification.confidence[
          field as keyof typeof AUTO_VERIFY_CONFIDENCE
        ] < threshold,
    )
  ) {
    reasons.push("verification_evidence");
  }
  if (!verification.isReceipt || verification.instructionLikeTextDetected) {
    reasons.push("verification_unsafe");
  }
  return reasons;
}

export function automaticConfirmationReasons(
  input: AutomaticConfirmationInput,
): AutomaticConfirmationReason[] {
  const reasons = new Set<AutomaticConfirmationReason>();
  const required =
    present(input.merchant) &&
    present(input.serviceDate) &&
    Number.isSafeInteger(input.receiptTotalPence) &&
    input.receiptTotalPence! > 0 &&
    Number.isSafeInteger(input.eligiblePence) &&
    input.eligiblePence! > 0 &&
    present(input.location) &&
    present(input.businessReason) &&
    present(input.category) &&
    (input.category !== "food" ||
      (present(input.transactionTime) && present(input.mealContext)));
  if (!required || input.unresolvedFields.length) reasons.add("required_fields");
  if (!confidenceIsHigh(input)) reasons.add("confidence");

  const linesComplete =
    input.lineItems.length > 0 &&
    input.lineItems.every(
      (line) =>
        Number.isSafeInteger(line.totalPence) &&
        typeof line.eligible === "boolean" &&
        typeof line.confidence === "number" &&
        line.confidence >= AUTO_CONFIRM_CONFIDENCE.lineItems,
    );
  if (input.reconciliationStatus !== "balanced" || !linesComplete) {
    reasons.add("arithmetic");
  }
  if (
    input.alcoholSuspected ||
    input.lineItems.some((line) => line.alcoholSuspected)
  ) {
    reasons.add("alcohol");
  }
  if (input.duplicateCount !== 0) reasons.add("duplicate");
  if (
    input.acknowledgements.alcohol ||
    input.acknowledgements.duplicate ||
    input.acknowledgements.reconciliation
  ) {
    reasons.add("acknowledgement");
  }
  if (input.extractedCurrency !== "GBP") reasons.add("currency");
  if (input.extractedCountry !== "GB") reasons.add("country");
  if (input.tripStatus === "ambiguous") reasons.add("trip_ambiguous");
  if (input.tripStatus === "invalid") reasons.add("trip_invalid");
  if (
    RECEIPT_EVIDENCE_FIELDS.some(
      (field) => input.provenance[field] === "owner",
    )
  ) {
    reasons.add("owner_evidence");
  }
  for (const reason of verificationReasons(input)) reasons.add(reason);
  return [...reasons];
}

export function canAutomaticallyConfirm(
  input: AutomaticConfirmationInput,
): boolean {
  return automaticConfirmationReasons(input).length === 0;
}

export function hasOwnerDuplicateAcknowledgement(
  reviewed: boolean,
  reviewedFingerprint: string | null,
): boolean {
  return reviewed && Boolean(reviewedFingerprint);
}

export async function automaticConfirmationFingerprint(input: {
  merchant: string;
  serviceDate: string;
  receiptTotalPence: number;
}): Promise<string> {
  const merchant = input.merchant
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-GB")
    .replace(/\s+/g, " ");
  const canonical = JSON.stringify([
    merchant,
    input.serviceDate,
    input.receiptTotalPence,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
