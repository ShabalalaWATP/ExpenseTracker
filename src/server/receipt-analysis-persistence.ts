import { auditStatement } from "./audit-repository";
import { database } from "./db";
import type { Principal } from "./principal";
import type {
  ReceiptExtraction,
  ReceiptField,
} from "./receipt-extraction";
import {
  chosen,
  confidenceIssue,
  safeJson,
  updateProvenance,
  type Provenance,
} from "./receipt-analysis-merge";
import { requiredMissing } from "./receipt-intake-analysis";
import type { ReceiptIntakeRow } from "./receipt-intake-model";
import { refreshDuplicateCandidates } from "./receipt-duplicates";
import { receiptRevisionStatement } from "./receipt-intake-revisions";

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
  const receiptTotalPence = chosen<number | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "receipt_total",
  );
  let eligiblePence = chosen<number | null>(
    row,
    extraction,
    priorProvenance,
    targeted,
    "eligible_amount",
  );
  const gratuityPence = chosen<number>(
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
  const provenance = updateProvenance(
    priorProvenance,
    extraction,
    targeted,
  );

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
    ] as const) {
      if (confidenceIssue(extraction, field)) uncertain.add(field);
      if (provenance[field] === "owner") {
        missing.delete(field);
        uncertain.delete(field);
      }
    }
  }
  if (
    receiptTotalPence !== null &&
    eligiblePence !== null &&
    eligiblePence > receiptTotalPence
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
    businessReason: row.business_reason,
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
      business_reason: row.business_reason,
    }[field];
    if (value !== null && value !== "") missing.delete(field);
  }

  const alcoholSuspected = targeted.size && !targeted.has("alcohol")
    ? Boolean(row.alcohol_suspected)
    : extraction.alcoholSuspected ||
      extraction.lineItems.some((item) => item.alcoholSuspected);
  const history = safeJson<unknown[]>(row.analysis_history_json, []);
  history.push({
    analysedAt: new Date().toISOString(),
    model,
    targetedFields: [...targeted],
    extraction: {
      merchant: extraction.merchant,
      serviceDate: extraction.serviceDate,
      receiptTotalPence: extraction.receiptTotalPence,
      eligiblePence: extraction.eligiblePence,
      gratuityPence: extraction.gratuityPence,
    },
  });
  const unresolvedCount =
    missing.size + uncertain.size + Number(alcoholSuspected);

  await database().batch([
    database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = ?, merchant = ?, service_date = ?,
             receipt_total_pence = ?, eligible_pence = ?,
             gratuity_pence = ?, location = ?,
             line_items_json = ?, confidence_json = ?,
             missing_fields_json = ?, uncertain_fields_json = ?,
             alcohol_suspected = ?, alcohol_reviewed = 0,
             reconciliation_reviewed = 0,
             extraction_json = ?, analysis_history_json = ?,
             correction_provenance_json = ?, image_edits_json = ?,
             analysis_object_key = COALESCE(?, analysis_object_key),
             ai_model = ?, error_code = NULL, error_message = NULL,
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
        location,
        targeted.size
          ? row.line_items_json
          : JSON.stringify(extraction.lineItems),
        targeted.size
          ? row.confidence_json
          : JSON.stringify(extraction.confidence),
        JSON.stringify([...missing]),
        JSON.stringify([...uncertain]),
        Number(alcoholSuspected),
        JSON.stringify(extraction),
        JSON.stringify(history.slice(-10)),
        JSON.stringify(provenance),
        JSON.stringify(
          options.imageEdits ?? safeJson(row.image_edits_json, {}),
        ),
        options.analysisObjectKey ?? null,
        model,
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
        ? [...targeted]
        : [
            "merchant",
            "service_date",
            "receipt_total",
            "eligible_amount",
            "gratuity",
            "location",
            "line_items",
            "alcohol",
          ],
      before: {
        merchant: row.merchant,
        serviceDate: row.service_date,
        receiptTotalPence: row.receipt_total_pence,
        eligiblePence: row.eligible_pence,
        gratuityPence: row.gratuity_pence,
      },
      after: {
        merchant,
        serviceDate,
        receiptTotalPence,
        eligiblePence,
        gratuityPence,
      },
      model,
      transform: options.imageEdits,
    }),
  ]);
  await refreshDuplicateCandidates(principal, row.id, {
    merchant,
    serviceDate,
    receiptTotalPence,
  });
}
