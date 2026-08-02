import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import * as policy from "../src/domain/receipt-auto-confirmation.ts";

type Input = Parameters<typeof policy.automaticConfirmationReasons>[0];

function cleanInput(): Input {
  const input: Input = {
    merchant: "Field Kitchen",
    serviceDate: "2026-07-30",
    receiptTotalPence: 1_250,
    eligiblePence: 1_250,
    location: "Portsmouth",
    businessReason: "Lunch at Field Kitchen",
    category: "food",
    transactionTime: "12:30",
    mealContext: "lunch",
    confidence: { ...policy.AUTO_CONFIRM_CONFIDENCE },
    unresolvedFields: [],
    reconciliationStatus: "balanced",
    lineItems: [
      {
        totalPence: 1_250,
        eligible: true,
        alcoholSuspected: false,
        confidence: policy.AUTO_CONFIRM_CONFIDENCE.lineItems,
      },
    ],
    alcoholSuspected: false,
    duplicateCount: 0,
    acknowledgements: {
      alcohol: false,
      duplicate: false,
      reconciliation: false,
    },
    extractedCurrency: "GBP",
    extractedCountry: "GB",
    tripStatus: "none",
    provenance: {
      merchant: "ai",
      service_date: "ai",
      transaction_time: "ai",
      receipt_total: "ai",
      eligible_amount: "ai",
      location: "ai",
      business_reason: "ai",
      meal_context: "ai",
      alcohol: "ai",
      category: "ai",
      gratuity: "ai",
    },
    verification: {
      serviceDate: "2026-07-30",
      receiptTotalPence: 1_250,
      eligiblePence: 1_250,
      receiptDocumentCount: 1,
      distinctTransactionCount: 1,
      sameMeal: null,
      currency: "GBP",
      country: "GB",
      isReceipt: true,
      instructionLikeTextDetected: false,
      evidence: {
        serviceDateVisible: true,
        receiptTotalVisible: true,
        eligibleBasisVisible: true,
        currencyVisible: true,
        countryVisible: true,
        merchantOrTaxIdentityVisible: true,
        documentsSeparated: true,
      },
      confidence: { ...policy.AUTO_VERIFY_CONFIDENCE },
    },
    groupReceiptPending: false,
    receiptDocumentCount: 1,
    distinctTransactionCount: 1,
    sameMeal: null,
  };
  return input;
}

describe("strict receipt automatic confirmation policy", () => {
  it("accepts only a complete clean receipt at the exact confidence limits", () => {
    const input = cleanInput();
    assert.equal(policy.canAutomaticallyConfirm(input), true);
    input.confidence.receiptTotal =
      policy.AUTO_CONFIRM_CONFIDENCE.receiptTotal - 0.001;
    assert.deepEqual(policy.automaticConfirmationReasons(input), ["confidence"]);
  });

  it("blocks incomplete or unreconciled arithmetic", () => {
    const incomplete = cleanInput();
    incomplete.lineItems = [];
    incomplete.reconciliationStatus = "incomplete";
    assert.ok(
      policy.automaticConfirmationReasons(incomplete).includes("arithmetic"),
    );
    const mismatch = cleanInput();
    mismatch.reconciliationStatus = "mismatch";
    mismatch.acknowledgements.reconciliation = true;
    assert.deepEqual(policy.automaticConfirmationReasons(mismatch), [
      "arithmetic",
      "acknowledgement",
    ]);
  });

  it("never relies on alcohol or duplicate acknowledgements", () => {
    const input = cleanInput();
    input.alcoholSuspected = true;
    input.duplicateCount = 1;
    input.acknowledgements.alcohol = true;
    input.acknowledgements.duplicate = true;
    assert.deepEqual(policy.automaticConfirmationReasons(input), [
      "alcohol",
      "duplicate",
      "acknowledgement",
    ]);
  });

  it("requires an owner answer when a receipt looks shared", () => {
    const input = cleanInput();
    input.groupReceiptPending = true;
    assert.ok(
      policy.automaticConfirmationReasons(input).includes("group_receipt"),
    );
  });

  it("allows verified same-meal receipts but blocks unrelated documents", () => {
    const sameMeal = cleanInput();
    sameMeal.receiptDocumentCount = 2;
    sameMeal.distinctTransactionCount = 2;
    sameMeal.sameMeal = true;
    sameMeal.verification = {
      ...sameMeal.verification!,
      receiptDocumentCount: 2,
      distinctTransactionCount: 2,
      sameMeal: true,
    };
    assert.equal(policy.canAutomaticallyConfirm(sameMeal), true);

    const unrelated = cleanInput();
    unrelated.receiptDocumentCount = 2;
    unrelated.distinctTransactionCount = 2;
    unrelated.sameMeal = false;
    unrelated.verification = {
      ...unrelated.verification!,
      receiptDocumentCount: 2,
      distinctTransactionCount: 2,
      sameMeal: false,
    };
    assert.ok(
      policy.automaticConfirmationReasons(unrelated).includes("multi_receipt"),
    );
  });

  it("does not mistake the automatic no-duplicate marker for owner review", () => {
    assert.equal(policy.hasOwnerDuplicateAcknowledgement(true, null), false);
    assert.equal(
      policy.hasOwnerDuplicateAcknowledgement(true, "candidate-fingerprint"),
      true,
    );
    const input = cleanInput();
    input.acknowledgements.duplicate =
      policy.hasOwnerDuplicateAcknowledgement(true, null);
    assert.equal(policy.canAutomaticallyConfirm(input), true);
  });

  it("requires known original geography and a completed foreign conversion", () => {
    for (const [currency, country] of [
      [null, null],
      ["UNKNOWN", "GB"],
      ["GBP", "UNKNOWN"],
      ["EUR", "FR"],
    ] as const) {
      const input = cleanInput();
      input.extractedCurrency = currency;
      input.extractedCountry = country;
      const reasons = policy.automaticConfirmationReasons(input);
      assert.equal(
        reasons.includes("currency"),
        currency === null || currency === "UNKNOWN" || currency === "EUR",
      );
      assert.equal(
        reasons.includes("country"),
        country === null || country === "UNKNOWN" || country === "FR",
      );
    }
  });

  it("permits independently verified foreign facts after deterministic conversion", () => {
    const input = cleanInput();
    input.extractedCurrency = "EUR";
    input.extractedCountry = "FR";
    input.originalReceiptTotalMinor = 1_500;
    input.originalEligibleMinor = 1_500;
    input.conversionAvailable = true;
    input.verification = {
      ...input.verification!,
      receiptTotalPence: 1_500,
      eligiblePence: 1_500,
      currency: "EUR",
      country: "FR",
      language: "fr",
    };
    assert.deepEqual(policy.automaticConfirmationReasons(input), []);
  });

  it("blocks ambiguous trips but permits explicit, matched or no trip", () => {
    for (const status of ["explicit", "matched", "none"] as const) {
      const input = cleanInput();
      input.tripStatus = status;
      assert.equal(policy.canAutomaticallyConfirm(input), true);
    }
    const ambiguous = cleanInput();
    ambiguous.tripStatus = "ambiguous";
    assert.deepEqual(policy.automaticConfirmationReasons(ambiguous), [
      "trip_ambiguous",
    ]);
  });

  it("requires time-derived meal context for food receipts", () => {
    const input = cleanInput();
    input.transactionTime = null;
    input.mealContext = null;
    assert.ok(
      policy.automaticConfirmationReasons(input).includes("required_fields"),
    );
  });

  it("requires a separate verifier with exact agreement and visible evidence", () => {
    const unavailable = cleanInput();
    unavailable.verification = null;
    assert.ok(
      policy
        .automaticConfirmationReasons(unavailable)
        .includes("verification_unavailable"),
    );

    const mismatch = cleanInput();
    mismatch.verification!.eligiblePence = 1_100;
    assert.ok(
      policy
        .automaticConfirmationReasons(mismatch)
        .includes("verification_mismatch"),
    );

    const weakEvidence = cleanInput();
    weakEvidence.verification!.evidence.countryVisible = false;
    weakEvidence.verification!.confidence.receiptEvidence = 0.97;
    assert.deepEqual(
      policy
        .automaticConfirmationReasons(weakEvidence)
        .filter((reason) => reason.startsWith("verification_")),
      ["verification_evidence"],
    );
  });

  it("treats instruction-like or non-receipt images as unsafe", () => {
    const instruction = cleanInput();
    instruction.verification!.instructionLikeTextDetected = true;
    assert.ok(
      policy
        .automaticConfirmationReasons(instruction)
        .includes("verification_unsafe"),
    );
    const nonReceipt = cleanInput();
    nonReceipt.verification!.isReceipt = false;
    assert.ok(
      policy
        .automaticConfirmationReasons(nonReceipt)
        .includes("verification_unsafe"),
    );
  });

  it("rejects owner changes to receipt evidence but permits trip and reason", () => {
    const evidenceEdit = cleanInput();
    evidenceEdit.provenance = {
      ...evidenceEdit.provenance,
      receipt_total: "owner",
    };
    assert.ok(
      policy
        .automaticConfirmationReasons(evidenceEdit)
        .includes("owner_evidence"),
    );
    for (const field of ["original_currency", "original_country"]) {
      const originEdit = cleanInput();
      originEdit.provenance = {
        ...originEdit.provenance,
        [field]: "owner",
      };
      assert.ok(
        policy
          .automaticConfirmationReasons(originEdit)
          .includes("owner_evidence"),
      );
    }

    const allowedContext = cleanInput();
    allowedContext.provenance = {
      ...allowedContext.provenance,
      business_reason: "owner",
      trip_id: "owner",
    };
    allowedContext.confidence.businessReason = 0;
    assert.equal(policy.canAutomaticallyConfirm(allowedContext), true);
  });

  it("canonicalises duplicate reservation fingerprints", async () => {
    const base = {
      merchant: "Field Kitchen",
      serviceDate: "2026-07-30",
      receiptTotalPence: 1_250,
    };
    const fingerprint = await policy.automaticConfirmationFingerprint(base);
    assert.equal(
      fingerprint,
      await policy.automaticConfirmationFingerprint({
        ...base,
        merchant: "  FIELD   KITCHEN ",
      }),
    );
    assert.notEqual(
      fingerprint,
      await policy.automaticConfirmationFingerprint({
        ...base,
        receiptTotalPence: 1_251,
      }),
    );
  });
});
