import {
  automaticConfirmationFingerprint,
  automaticConfirmationReasons,
  hasOwnerDuplicateAcknowledgement,
} from "@/src/domain/receipt-auto-confirmation";
import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { assertDateUnlocked } from "./claim-locks";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { safeJson, type Provenance } from "./receipt-analysis-merge";
import { runReceiptAutoVerification } from "./receipt-auto-confirmation-verifier";
import { autoConfirmationReviewMessage } from "./receipt-auto-confirmation-review";
import {
  releaseAutomaticConfirmationReservation,
  reserveAutomaticConfirmation,
} from "./receipt-auto-confirmation-reservation";
import { duplicateCandidateState } from "./receipt-duplicates";
import type { ReceiptExtraction } from "./receipt-extraction";
import {
  abandonAutoConfirmLease,
  acquireAutoConfirmLease,
  recoverExpiredAutoConfirmLease,
  recoverStaleTokenlessAnalysis,
} from "./receipt-intake-auto-confirm-lease";
import { commitReceiptIntakeExpense } from "./receipt-intake-expense";
import {
  publicIntake,
  receiptGroupReview,
  unresolvedFields,
} from "./receipt-intake-model";
import { requireIntake } from "./receipt-intake-repository";
import { resolveReceiptTripLink } from "./receipt-trip-link";

function lineItems(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
      .map((item) => ({
        totalPence: Number.isSafeInteger(item.totalPence)
          ? (item.totalPence as number)
          : null,
        eligible:
          typeof item.eligible === "boolean" ? item.eligible : null,
        alcoholSuspected: item.alcoholSuspected === true,
        confidence:
          typeof item.confidence === "number" ? item.confidence : undefined,
      }));
  } catch {
    return [];
  }
}

async function markReview(
  principal: Principal,
  id: string,
  reasons: readonly string[],
  trip: {
    tripId: string | null;
    tripLegId: string | null;
    provenance: Provenance;
    errorCode: string | null;
    errorMessage: string | null;
  },
  leaseToken: string,
) {
  const detail =
    trip.errorMessage ?? autoConfirmationReviewMessage(reasons);
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'needs_review', trip_id = ?, trip_leg_id = ?,
           correction_provenance_json = ?, error_code = ?, error_message = ?,
           auto_confirm_token = NULL, auto_confirm_lease_expires_at = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL AND auto_confirm_token = ?
         AND auto_confirm_lease_expires_at >
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(
      trip.tripId,
      trip.tripLegId,
      JSON.stringify(trip.provenance),
      trip.errorCode ?? "receipt_auto_review_required",
      detail,
      principal.ownerId,
      id,
      leaseToken,
    )
    .run();
  await recoverExpiredAutoConfirmLease(principal, id, leaseToken);
  return publicIntake(await requireIntake(principal, id));
}

export async function attemptAutoConfirmReceiptIntake(
  principal: Principal,
  id: string,
) {
  const initial = await requireIntake(principal, id);
  if (initial.status === "confirmed" && initial.expense_id) {
    return {
      outcome: "confirmed" as const,
      intake: publicIntake(initial),
      reasons: [],
    };
  }
  if (initial.status === "analysing") {
    if (initial.auto_confirm_token) {
      await recoverExpiredAutoConfirmLease(
        principal,
        id,
        initial.auto_confirm_token,
      );
      const current = await requireIntake(principal, id);
      if (current.status !== "analysing") {
        return {
          outcome: "needs_review" as const,
          intake: publicIntake(current),
          reasons: ["required_fields"],
        };
      }
    } else if (await recoverStaleTokenlessAnalysis(principal, id)) {
      return {
        outcome: "needs_review" as const,
        intake: publicIntake(await requireIntake(principal, id)),
        reasons: ["required_fields"],
      };
    }
    return {
      outcome: "in_progress" as const,
      intake: publicIntake(await requireIntake(principal, id)),
      reasons: [],
    };
  }
  if (initial.status !== "ready") {
    return {
      outcome: "needs_review" as const,
      intake: publicIntake(initial),
      reasons: ["required_fields"],
    };
  }
  const leaseToken = await acquireAutoConfirmLease(
    principal,
    id,
    initial.updated_at,
  );
  if (!leaseToken) {
    let current = await requireIntake(principal, id);
    if (current.status === "analysing" && current.auto_confirm_token) {
      await recoverExpiredAutoConfirmLease(
        principal,
        id,
        current.auto_confirm_token,
      );
      current = await requireIntake(principal, id);
    } else if (current.status === "analysing") {
      await recoverStaleTokenlessAnalysis(principal, id);
      current = await requireIntake(principal, id);
    }
    return {
      outcome:
        current.status === "confirmed"
          ? ("confirmed" as const)
          : current.status === "analysing"
            ? ("in_progress" as const)
            : ("needs_review" as const),
      intake: publicIntake(current),
      reasons:
        current.status === "confirmed" || current.status === "analysing"
          ? []
          : ["required_fields"],
    };
  }

  let reservationFingerprint: string | null = null;
  let activeTrip: {
    tripId: string | null;
    tripLegId: string | null;
    provenance: Provenance;
    errorCode: string | null;
    errorMessage: string | null;
  } | null = null;
  try {
    const row = await requireIntake(principal, id);
    const trip = await resolveReceiptTripLink(principal, {
      serviceDate: row.service_date,
      tripId: row.trip_id,
      tripLegId: row.trip_leg_id,
      originalCountry: row.original_country,
      provenance: safeJson(row.correction_provenance_json, {}),
    });
    const tripStatus = trip.resolution.status;
    activeTrip = trip;
    const duplicates = await duplicateCandidateState(principal, id, {
      merchant: row.merchant,
      serviceDate: row.service_date,
      receiptTotalPence: row.receipt_total_pence,
      originalCurrency: row.original_currency,
      originalAmountMinor: row.original_receipt_total_minor,
    });
    const lines = lineItems(row.line_items_json);
    const reconciliation = reconcileReceipt(
      lines,
      row.original_receipt_total_minor,
      row.original_eligible_minor,
      row.original_gratuity_minor,
    );
    const extraction = safeJson<Partial<ReceiptExtraction>>(
      row.extraction_json,
      {},
    );
    const receiptDocuments = Array.isArray(extraction.receiptDocuments)
      ? extraction.receiptDocuments
      : [];
    const receiptDocumentCount = Math.max(1, receiptDocuments.length);
    const distinctTransactionCount = Math.max(
      1,
      receiptDocuments.filter(
        (document) => document.duplicateOfDocumentIndex === null,
      ).length,
    );
    const provenance = safeJson<Provenance>(
      row.correction_provenance_json,
      {},
    );
    let verified: Awaited<ReturnType<typeof runReceiptAutoVerification>>;
    try {
      verified = await runReceiptAutoVerification(principal, row);
    } catch {
      return {
        outcome: "needs_review" as const,
        intake: await markReview(
          principal,
          id,
          ["verification_unavailable"],
          trip,
          leaseToken,
        ),
        reasons: ["verification_unavailable"],
      };
    }
    const reasons = automaticConfirmationReasons({
      merchant: row.merchant,
      serviceDate: row.service_date,
      receiptTotalPence: row.receipt_total_pence,
      eligiblePence: row.eligible_pence,
      location: row.location,
      businessReason: row.business_reason,
      category: row.category,
      transactionTime: extraction.transactionTime ?? null,
      mealContext: row.meal_context,
      confidence: safeJson(row.confidence_json, {}),
      unresolvedFields: unresolvedFields(row),
      reconciliationStatus: reconciliation.status,
      lineItems: lines,
      alcoholSuspected: Boolean(row.alcohol_suspected),
      duplicateCount: duplicates.candidates.length,
      acknowledgements: {
        alcohol: Boolean(row.alcohol_reviewed),
        duplicate: hasOwnerDuplicateAcknowledgement(
          Boolean(row.duplicate_reviewed),
          row.duplicate_reviewed_fingerprint,
        ),
        reconciliation: Boolean(row.reconciliation_reviewed),
      },
      extractedCurrency: row.original_currency,
      extractedCountry: row.original_country,
      originalReceiptTotalMinor: row.original_receipt_total_minor,
      originalEligibleMinor: row.original_eligible_minor,
      conversionAvailable:
        row.receipt_total_pence !== null &&
        row.eligible_pence !== null &&
        safeJson<{ status?: string }>(row.conversion_json, {}).status !==
          "unavailable",
      tripStatus,
      provenance,
      verification: verified.verification,
      groupReceiptPending: receiptGroupReview(row).pending,
      receiptDocumentCount,
      distinctTransactionCount,
      sameMeal: extraction.multiReceipt?.sameMeal ?? null,
    });
    if (reasons.length) {
      return {
        outcome: "needs_review" as const,
        intake: await markReview(principal, id, reasons, trip, leaseToken),
        reasons,
      };
    }
    await assertDateUnlocked(principal.ownerId, row.service_date!);
    reservationFingerprint = await automaticConfirmationFingerprint({
      merchant: row.merchant!,
      serviceDate: row.service_date!,
      receiptTotalPence: row.receipt_total_pence!,
      originalCurrency: row.original_currency,
      originalAmountMinor: row.original_receipt_total_minor!,
    });
    if (
      !(await reserveAutomaticConfirmation(
        principal,
        id,
        reservationFingerprint,
        leaseToken,
      ))
    ) {
      return {
        outcome: "needs_review" as const,
        intake: await markReview(
          principal,
          id,
          ["duplicate"],
          trip,
          leaseToken,
        ),
        reasons: ["duplicate"],
      };
    }
    const result = await commitReceiptIntakeExpense(
      principal,
      {
        ...row,
        trip_id: trip.tripId,
        trip_leg_id: trip.tripLegId,
        correction_provenance_json: JSON.stringify(trip.provenance),
      },
      {
        automatic: true,
        reservationFingerprint,
        leaseToken,
        verificationAudit: verified.audit,
      },
    );
    return { outcome: "confirmed" as const, ...result, reasons: [] };
  } catch (error) {
    if (reservationFingerprint) {
      await releaseAutomaticConfirmationReservation(
        principal,
        id,
        reservationFingerprint,
        leaseToken,
      ).catch(() => {});
    }
    if (
      error instanceof ApiError &&
      error.code === "receipt_auto_confirmation_changed" &&
      activeTrip
    ) {
      return {
        outcome: "needs_review" as const,
        intake: await markReview(
          principal,
          id,
          ["trip_invalid"],
          activeTrip,
          leaseToken,
        ),
        reasons: ["trip_invalid"],
      };
    }
    await abandonAutoConfirmLease(principal, id, leaseToken);
    throw error;
  }
}
