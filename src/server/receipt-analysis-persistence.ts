import { auditStatement } from "./audit-repository";
import { database } from "./db";
import type { Principal } from "./principal";
import type {
  ReceiptExtraction,
  ReceiptField,
} from "./receipt-extraction";
import { mealContextFromTime } from "./receipt-extraction";
import {
  appendAnalysisHistory,
  chosen,
  confidenceIssue,
  mergedConfidence,
  mergedExtractionSnapshot,
  safeJson,
  updateProvenance,
  type Provenance,
} from "./receipt-analysis-merge";
import { requiredMissing } from "./receipt-intake-analysis";
import type { ReceiptIntakeRow } from "./receipt-intake-model";
import { refreshDuplicateCandidates } from "./receipt-duplicates";
import { receiptRevisionStatement } from "./receipt-intake-revisions";
import { resolveReceiptTripLink } from "./receipt-trip-link";
import {
  convertReceiptToGbp,
  type ReceiptConversion,
} from "./fx-conversion";
export async function persistReceiptExtraction(
  principal: Principal,
  row: ReceiptIntakeRow,
  extraction: ReceiptExtraction,
  model: string,
  options: {
    targetedFields?: readonly ReceiptField[];
    imageEdits?: Record<string, number>;
    analysisObjectKey?: string;
  } = {},
): Promise<void> {
  const targeted = new Set(options.targetedFields ?? []);
  const priorProvenance = safeJson<Provenance>(
    row.correction_provenance_json,
    {},
  );
  const merchant = chosen<string | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "merchant",
  );
  const serviceDate = chosen<string | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "service_date",
  );
  const transactionTime = chosen<string | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "transaction_time",
  );
  const extractedReceiptTotal = chosen<number | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "receipt_total",
  );
  const extractedEligible = chosen<number | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "eligible_amount",
  );
  const extractedGratuity = chosen<number>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "gratuity",
  );
  const location = chosen<string | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "location",
  );
  const category = chosen<string | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "category",
  );
  const businessReason = chosen<string | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "business_reason",
  );
  const proposedMealContext = chosen<ReceiptExtraction["mealContext"]>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "meal_context",
  );
  const mealContext =
    category !== "food"
      ? null
      : priorProvenance.meal_context === "owner" &&
          !targeted.has("meal_context")
        ? proposedMealContext
        : mealContextFromTime(
            category,
            transactionTime,
            proposedMealContext,
          );
  const tripLink = await resolveReceiptTripLink(principal, {
    serviceDate,
    tripId: row.trip_id,
    tripLegId: row.trip_leg_id,
    originalCountry: targeted.size
      ? row.original_country
      : extraction.country,
    provenance: updateProvenance(priorProvenance, extraction, targeted),
  });
  const { provenance, tripId, tripLegId } = tripLink;
  const originalCurrency = targeted.size
    ? row.original_currency
    : extraction.currency;
  const originalCountry = targeted.size
    ? row.original_country
    : extraction.country;
  const originalLanguage = targeted.size
    ? row.original_language
    : extraction.language ?? "und";
  const originalMinorUnitDigits = targeted.size
    ? row.original_minor_unit_digits
    : extraction.minorUnitDigits ?? null;
  const originalReceiptTotalMinor =
    targeted.size && !targeted.has("receipt_total")
      ? row.original_receipt_total_minor
      : extractedReceiptTotal;
  const originalEligibleMinor =
    targeted.size && !targeted.has("eligible_amount")
      ? row.original_eligible_minor
      : extractedEligible;
  const originalGratuityMinor =
    targeted.size
      ? row.original_gratuity_minor
      : extractedGratuity;
  const conversionMustRefresh =
    !targeted.size ||
    targeted.has("service_date") ||
    targeted.has("receipt_total") ||
    targeted.has("eligible_amount");
  let receiptTotalPence = row.receipt_total_pence;
  let eligiblePence = row.eligible_pence;
  let gratuityPence = row.gratuity_pence;
  let exchangeRateQuoteId = row.exchange_rate_quote_id;
  let conversionJson = row.conversion_json;
  if (conversionMustRefresh) {
    let conversion: ReceiptConversion | null = null;
    try {
      if (
        originalCurrency !== "UNKNOWN" &&
        serviceDate &&
        originalMinorUnitDigits !== null &&
        originalReceiptTotalMinor !== null &&
        originalEligibleMinor !== null
      ) {
        conversion = await convertReceiptToGbp(principal, {
          originalCurrency,
          serviceDate,
          originalMinorUnitDigits,
          receiptTotalMinor: originalReceiptTotalMinor,
          eligibleMinor: originalEligibleMinor,
          gratuityMinor: originalGratuityMinor,
        });
      }
    } catch {
      // A missing public reference rate is a review condition. The frozen
      // original receipt facts remain available for a later retry.
    }
    receiptTotalPence = conversion?.receiptTotalPence ?? null;
    eligiblePence = conversion?.eligiblePence ?? null;
    gratuityPence = conversion?.gratuityPence ?? 0;
    exchangeRateQuoteId = conversion?.quoteId ?? null;
    conversionJson = JSON.stringify(
      conversion ?? {
        status: "unavailable",
        requestedDate: serviceDate,
        originalCurrency,
        targetCurrency: "GBP",
      },
    );
  }

  const missing = new Set(
    targeted.size
      ? safeJson<string[]>(row.missing_fields_json, [])
      : extraction.missingFields,
  );
  const uncertain = new Set(
    targeted.size
      ? safeJson<string[]>(row.uncertain_fields_json, [])
      : extraction.uncertainFields,
  );
  for (const field of targeted) {
    missing.delete(field);
    uncertain.delete(field);
    if (extraction.missingFields.includes(field)) missing.add(field);
    if (
      extraction.uncertainFields.includes(field) ||
      confidenceIssue(extraction, field)
    ) {
      uncertain.add(field);
    }
  }
  if (!targeted.size) {
    for (const field of extraction.uncertainFields) uncertain.add(field);
    for (const field of [
      "merchant",
      "service_date",
      "receipt_total",
      "eligible_amount",
      "location",
      "business_reason",
    ] as const) {
      if (confidenceIssue(extraction, field)) uncertain.add(field);
      if (provenance[field] === "owner") {
        missing.delete(field);
        uncertain.delete(field);
      }
    }
  }
  // Time and meal labels improve automation but are not evidence required to
  // create a valid expense. Their absence must not turn every receipt into a
  // manual clarification.
  missing.delete("transaction_time");
  missing.delete("meal_context");
  uncertain.delete("transaction_time");
  uncertain.delete("meal_context");
  if (
    originalReceiptTotalMinor !== null &&
    originalEligibleMinor !== null &&
    originalEligibleMinor > originalReceiptTotalMinor
  ) {
    eligiblePence = null;
    uncertain.add("eligible_amount");
  }
  for (const field of requiredMissing({
    merchant,
    serviceDate,
    receiptTotalPence,
    eligiblePence,
    location,
    businessReason,
  })) {
    missing.add(field);
  }
  for (const field of [
    "merchant",
    "service_date",
    "receipt_total",
    "eligible_amount",
    "location",
    "business_reason",
  ]) {
    const value = {
      merchant,
      service_date: serviceDate,
      receipt_total: receiptTotalPence,
      eligible_amount: eligiblePence,
      location,
      business_reason: businessReason,
    }[field];
    if (value !== null && value !== "") missing.delete(field);
  }

  const alcoholSuspected = targeted.size && !targeted.has("alcohol")
    ? Boolean(row.alcohol_suspected)
    : extraction.alcoholSuspected ||
      extraction.lineItems.some((item) => item.alcoholSuspected);
  const confidence = mergedConfidence(row, extraction, targeted);
  const storedExtraction = mergedExtractionSnapshot(
    row,
    extraction,
    targeted,
    {
    merchant,
    serviceDate,
    transactionTime,
    receiptTotalPence: originalReceiptTotalMinor,
    eligiblePence: originalEligibleMinor,
    gratuityPence: originalGratuityMinor,
    locationHint: location,
    businessReason,
    mealContext,
    category,
    lineItems: targeted.size
      ? safeJson(row.line_items_json, extraction.lineItems)
      : extraction.lineItems,
    alcoholSuspected,
    confidence,
    },
  );
  const history = appendAnalysisHistory(row, extraction, model, targeted);
  const tripMatchAmbiguous = Boolean(tripLink.errorCode);
  const unresolvedCount =
    missing.size +
    uncertain.size +
    Number(alcoholSuspected) +
    Number(tripMatchAmbiguous);

  await database().batch([
    database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = ?, merchant = ?, service_date = ?,
             receipt_total_pence = ?, eligible_pence = ?,
             gratuity_pence = ?, currency = 'GBP',
             original_currency = ?, original_country = ?,
             original_language = ?, original_receipt_total_minor = ?,
             original_eligible_minor = ?, original_gratuity_minor = ?,
             original_minor_unit_digits = ?, exchange_rate_quote_id = ?,
             translation_json = ?, conversion_json = ?,
             location = ?, business_reason = ?,
             meal_context = ?, category = ?, trip_id = ?, trip_leg_id = ?,
             line_items_json = ?, confidence_json = ?,
             missing_fields_json = ?, uncertain_fields_json = ?,
             alcohol_suspected = ?, alcohol_reviewed = 0,
             reconciliation_reviewed = 0,
             extraction_json = ?, analysis_history_json = ?,
             correction_provenance_json = ?, image_edits_json = ?,
             analysis_object_key = COALESCE(?, analysis_object_key),
             ai_model = ?, error_code = ?, error_message = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(
        unresolvedCount ? "needs_review" : "ready",
        merchant,
        serviceDate,
        receiptTotalPence,
        eligiblePence,
        gratuityPence,
        originalCurrency,
        originalCountry,
        originalLanguage,
        originalReceiptTotalMinor,
        originalEligibleMinor,
        originalGratuityMinor,
        originalMinorUnitDigits,
        exchangeRateQuoteId,
        targeted.size
          ? row.translation_json
          : JSON.stringify(extraction.translation ?? {}),
        conversionJson,
        location,
        businessReason,
        mealContext,
        category,
        tripId,
        tripLegId,
        targeted.size
          ? row.line_items_json
          : JSON.stringify(extraction.lineItems),
        JSON.stringify(confidence),
        JSON.stringify([...missing]),
        JSON.stringify([...uncertain]),
        Number(alcoholSuspected),
        JSON.stringify(storedExtraction),
        JSON.stringify(history),
        JSON.stringify(provenance),
        JSON.stringify(
          options.imageEdits ?? safeJson(row.image_edits_json, {}),
        ),
        options.analysisObjectKey ?? null,
        model,
        tripLink.errorCode,
        tripLink.errorMessage,
        principal.ownerId,
        row.id,
      ),
    auditStatement(principal, {
      action: targeted.size
        ? "receipt_intake.field_reanalysed"
        : "receipt_intake.analysed",
      entityType: "receipt_intake",
      entityId: row.id,
      metadata: {
        model,
        requiresReview: Boolean(unresolvedCount),
        lineItemCount: extraction.lineItems.length,
        targetedFields: [...targeted].join(","),
        tripLinkStatus: tripLink.resolution.status,
      },
    }),
    receiptRevisionStatement(principal, {
      intakeId: row.id,
      source: row.extraction_json
        ? targeted.size
          ? "ai_targeted"
          : "ai_full"
        : "ai_initial",
      fields: targeted.size
        ? [
            ...targeted,
            ...(tripId !== row.trip_id ? ["trip_id"] : []),
          ]
        : [
            "merchant",
            "service_date",
            "transaction_time",
            "receipt_total",
            "eligible_amount",
            "gratuity",
            "location",
            "business_reason",
            "meal_context",
            "line_items",
            "alcohol",
            "category",
            "trip_id",
          ],
      before: {
        merchant: row.merchant,
        serviceDate: row.service_date,
        receiptTotalPence: row.receipt_total_pence,
        eligiblePence: row.eligible_pence,
        gratuityPence: row.gratuity_pence,
        businessReason: row.business_reason,
        mealContext: row.meal_context,
        tripId: row.trip_id,
      },
      after: {
        merchant,
        serviceDate,
        receiptTotalPence,
        eligiblePence,
        gratuityPence,
        businessReason,
        mealContext,
        tripId,
      },
      model,
      transform: options.imageEdits,
    }),
  ]);
  await refreshDuplicateCandidates(principal, row.id, {
    merchant,
    serviceDate,
    receiptTotalPence: originalReceiptTotalMinor,
    originalCurrency,
    originalAmountMinor: originalReceiptTotalMinor,
  });
}
