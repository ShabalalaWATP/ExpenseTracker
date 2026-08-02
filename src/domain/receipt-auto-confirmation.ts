export const AUTO_CONFIRM_CONFIDENCE = {
  merchant: 0.88,
  serviceDate: 0.9,
  receiptTotal: 0.9,
  eligibleAmount: 0.9,
  location: 0.85,
  businessReason: 0.8,
  category: 0.85,
  transactionTime: 0.8,
  mealContext: 0.8,
  gratuity: 0.85,
  lineItems: 0.88,
} as const;

export const AUTO_VERIFY_CONFIDENCE = {
  serviceDate: 0.95,
  receiptTotal: 0.95,
  eligibleAmount: 0.95,
  currency: 0.95,
  country: 0.95,
  receiptEvidence: 0.95,
  documentSeparation: 0.95,
} as const;

export type ReceiptAutoVerification = {
  serviceDate: string | null;
  receiptTotalPence: number | null;
  eligiblePence: number | null;
  receiptDocumentCount: number;
  distinctTransactionCount: number;
  sameMeal: boolean | null;
  currency: string;
  country: string;
  language?: string | null;
  translation?: {
    merchant: string | null;
    locationHint: string | null;
    lineItemDescriptions: string[];
  };
  isReceipt: boolean;
  instructionLikeTextDetected: boolean;
  evidence: {
    serviceDateVisible: boolean;
    receiptTotalVisible: boolean;
    eligibleBasisVisible: boolean;
    currencyVisible: boolean;
    countryVisible: boolean;
    merchantOrTaxIdentityVisible: boolean;
    documentsSeparated: boolean;
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
  | "conversion"
  | "trip_ambiguous"
  | "trip_invalid"
  | "owner_evidence"
  | "verification_unavailable"
  | "verification_mismatch"
  | "verification_evidence"
  | "verification_unsafe"
  | "group_receipt"
  | "multi_receipt";

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
  originalReceiptTotalMinor?: number | null;
  originalEligibleMinor?: number | null;
  conversionAvailable?: boolean;
  tripStatus:
    | "explicit"
    | "matched"
    | "none"
    | "ambiguous"
    | "leg_ambiguous"
    | "country_conflict"
    | "invalid";
  provenance: Readonly<Record<string, "ai" | "owner" | "auto">>;
  verification: ReceiptAutoVerification | null;
  groupReceiptPending: boolean;
  receiptDocumentCount: number;
  distinctTransactionCount: number;
  sameMeal: boolean | null;
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
  "original_currency",
  "original_country",
] as const;

function verificationReasons(
  input: AutomaticConfirmationInput,
): AutomaticConfirmationReason[] {
  const verification = input.verification;
  if (!verification) return ["verification_unavailable"];
  const reasons: AutomaticConfirmationReason[] = [];
  if (
    verification.serviceDate !== input.serviceDate ||
    verification.receiptTotalPence !==
      (input.originalReceiptTotalMinor ?? input.receiptTotalPence) ||
    verification.eligiblePence !==
      (input.originalEligibleMinor ?? input.eligiblePence) ||
    verification.currency !== input.extractedCurrency ||
    verification.country !== input.extractedCountry ||
    verification.receiptDocumentCount !== input.receiptDocumentCount ||
    verification.distinctTransactionCount !== input.distinctTransactionCount ||
    verification.sameMeal !== input.sameMeal
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
  if (input.groupReceiptPending) reasons.add("group_receipt");
  if (input.distinctTransactionCount > 1 && input.sameMeal !== true) {
    reasons.add("multi_receipt");
  }
  if (
    input.acknowledgements.alcohol ||
    input.acknowledgements.duplicate ||
    input.acknowledgements.reconciliation
  ) {
    reasons.add("acknowledgement");
  }
  if (
    !input.extractedCurrency ||
    input.extractedCurrency === "UNKNOWN" ||
    (input.extractedCurrency !== "GBP" &&
      input.conversionAvailable !== true)
  ) {
    reasons.add("currency");
  }
  if (
    !input.extractedCountry ||
    input.extractedCountry === "UNKNOWN" ||
    (input.extractedCountry !== "GB" &&
      input.conversionAvailable !== true)
  ) {
    reasons.add("country");
  }
  if (input.conversionAvailable === false) reasons.add("conversion");
  if (input.tripStatus === "ambiguous") reasons.add("trip_ambiguous");
  if (input.tripStatus === "leg_ambiguous") reasons.add("trip_ambiguous");
  if (
    input.tripStatus === "invalid" ||
    input.tripStatus === "country_conflict"
  ) {
    reasons.add("trip_invalid");
  }
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
  originalCurrency?: string;
  originalAmountMinor?: number;
}): Promise<string> {
  const merchant = input.merchant
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-GB")
    .replace(/\s+/g, " ");
  const canonical = JSON.stringify([
    merchant,
    input.serviceDate,
    input.originalCurrency ?? "GBP",
    input.originalAmountMinor ?? input.receiptTotalPence,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
