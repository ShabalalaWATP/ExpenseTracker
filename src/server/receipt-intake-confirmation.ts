import { reconcileReceipt } from "@/src/domain/receipt-reconciliation";
import { assertDateUnlocked } from "./claim-locks";
import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { assertDuplicatesReviewed } from "./receipt-duplicates";
import { safeJson, type Provenance } from "./receipt-analysis-merge";
import { unresolvedFields } from "./receipt-intake-model";
import { requireIntake } from "./receipt-intake-repository";
import { requireReceiptAttestation } from "./receipt-intake-validation";
import { commitReceiptIntakeExpense } from "./receipt-intake-expense";
import { resolveReceiptTripLink } from "./receipt-trip-link";

function reconciliationLines(value: string) {
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

async function releaseLock(
  principal: Principal,
  id: string,
  priorStatus: string,
) {
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = 'analysing'
         AND expense_id IS NULL`,
    )
    .bind(priorStatus, principal.ownerId, id)
    .run()
    .catch(() => {});
}

export async function confirmReceiptIntake(
  principal: Principal,
  id: string,
  confirmation: unknown,
) {
  requireReceiptAttestation(confirmation);
  const initial = await requireIntake(principal, id);
  if (initial.status === "confirmed") {
    throw new ApiError(409, "receipt_confirmed", "This receipt is already confirmed.");
  }
  if (initial.status === "analysing") {
    throw new ApiError(
      409,
      "receipt_analysis_in_progress",
      "Wait for receipt analysis to finish before confirming it.",
    );
  }
  const locked = await database()
    .prepare(
      `UPDATE receipt_intakes
       SET status = 'analysing',
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE owner_id = ? AND id = ? AND status = ? AND updated_at = ?
       RETURNING id`,
    )
    .bind(principal.ownerId, id, initial.status, initial.updated_at)
    .first<{ id: string }>();
  if (!locked) {
    throw new ApiError(
      409,
      "receipt_changed",
      "This receipt changed in another tab. Reopen it before confirming.",
    );
  }

  try {
    const row = await requireIntake(principal, id);
    const unresolved = unresolvedFields(row);
    if (unresolved.length) {
      throw new ApiError(
        409,
        "receipt_needs_review",
        "Resolve the highlighted receipt details before confirming.",
        { fields: unresolved },
      );
    }
    if (
      !row.merchant ||
      !row.service_date ||
      !row.location ||
      !row.business_reason ||
      row.receipt_total_pence === null ||
      row.eligible_pence === null
    ) {
      throw new ApiError(
        409,
        "receipt_needs_review",
        "Complete all required receipt details before confirming.",
      );
    }
    if (
      row.original_currency === "UNKNOWN" ||
      row.original_country === "UNKNOWN" ||
      row.original_receipt_total_minor === null ||
      row.original_eligible_minor === null ||
      safeJson<{ status?: string }>(row.conversion_json, {}).status ===
        "unavailable"
    ) {
      throw new ApiError(
        409,
        "receipt_conversion_required",
        "Confirm the original currency, country and deterministic GBP conversion before adding this expense.",
      );
    }
    if (
      row.eligible_pence > row.receipt_total_pence ||
      row.gratuity_pence > row.eligible_pence
    ) {
      throw new ApiError(
        400,
        "validation_failed",
        "Eligible amount and gratuity must fit within the receipt total.",
      );
    }
    const reconciliation = reconcileReceipt(
      reconciliationLines(row.line_items_json),
      row.original_receipt_total_minor,
      row.original_eligible_minor,
      row.original_gratuity_minor,
    );
    if (
      reconciliation.status === "mismatch" &&
      !Boolean(row.reconciliation_reviewed)
    ) {
      throw new ApiError(
        409,
        "receipt_reconciliation_review_required",
        "Check the receipt arithmetic and acknowledge the mismatch before confirming.",
        reconciliation,
      );
    }
    await assertDuplicatesReviewed(principal, id, {
      merchant: row.merchant,
      serviceDate: row.service_date,
      receiptTotalPence: row.receipt_total_pence,
      originalCurrency: row.original_currency,
      originalAmountMinor: row.original_receipt_total_minor,
    });
    await assertDateUnlocked(principal.ownerId, row.service_date);
    const tripLink = await resolveReceiptTripLink(principal, {
      serviceDate: row.service_date,
      tripId: row.trip_id,
      tripLegId: row.trip_leg_id,
      originalCountry: row.original_country,
      provenance: safeJson<Provenance>(
        row.correction_provenance_json,
        {},
      ),
    });
    if (tripLink.errorCode) {
      await database()
        .prepare(
          `UPDATE receipt_intakes
           SET trip_id = ?, trip_leg_id = ?,
               correction_provenance_json = ?,
               error_code = ?,
               error_message = ?
           WHERE owner_id = ? AND id = ? AND status = 'analysing'`,
        )
        .bind(
          tripLink.tripId,
          tripLink.tripLegId,
          JSON.stringify(tripLink.provenance),
          tripLink.errorCode,
          tripLink.errorMessage,
          principal.ownerId,
          id,
        )
        .run();
      throw new ApiError(
        409,
        tripLink.errorCode,
        tripLink.errorMessage ??
          "Select the correct trip, or explicitly leave this receipt unlinked.",
      );
    }
    if (tripLink.tripId) {
      const trip = await database()
        .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
        .bind(principal.ownerId, tripLink.tripId)
        .first<{ id: string }>();
      if (!trip) {
        throw new ApiError(400, "trip_invalid", "The selected trip does not exist.");
      }
    }
    return commitReceiptIntakeExpense(
      principal,
      {
        ...row,
        trip_id: tripLink.tripId,
        trip_leg_id: tripLink.tripLegId,
        correction_provenance_json: JSON.stringify(tripLink.provenance),
      },
      { automatic: false },
    );
  } catch (error) {
    await releaseLock(principal, id, initial.status);
    throw error;
  }
}
