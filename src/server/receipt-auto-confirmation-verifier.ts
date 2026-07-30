import { getReceiptsBucket } from "@/db";
import {
  AUTO_VERIFY_CONFIDENCE,
  type ReceiptAutoVerification,
} from "@/src/domain/receipt-auto-confirmation";
import { consumeAiQuota } from "./ai-quota";
import { auditStatement } from "./audit-repository";
import { database } from "./db";
import type { Principal } from "./principal";
import { verifyReceiptForAutoConfirmation } from "./receipt-auto-verification";
import { safeJson } from "./receipt-analysis-merge";
import type { ReceiptIntakeRow } from "./receipt-intake-model";
import { receiptSha256 } from "./receipt-intake-storage";
import { validateImageType } from "./receipt-repository";
import { runtimeConfig } from "./runtime-config";

const MAX_VERIFICATION_BYTES = 10 * 1024 * 1024;

export type VerificationAudit = {
  verifierModel: string;
  verifierResult: "passed" | "review" | "unavailable";
  verifierMinimumConfidence: number | null;
};

function assessment(
  row: ReceiptIntakeRow,
  verification: ReceiptAutoVerification,
) {
  const exactAgreement =
    verification.serviceDate === row.service_date &&
    verification.receiptTotalPence === row.original_receipt_total_minor &&
    verification.eligiblePence === row.original_eligible_minor &&
    verification.currency === row.original_currency &&
    verification.country === row.original_country;
  const evidenceComplete = Object.values(verification.evidence).every(Boolean);
  const safe =
    verification.isReceipt && !verification.instructionLikeTextDetected;
  const minimumConfidence = Math.min(
    ...Object.values(verification.confidence),
  );
  const confidenceSufficient = Object.entries(AUTO_VERIFY_CONFIDENCE).every(
    ([field, threshold]) =>
      verification.confidence[
        field as keyof typeof AUTO_VERIFY_CONFIDENCE
      ] >= threshold,
  );
  return {
    exactAgreement,
    evidenceComplete,
    safe,
    minimumConfidence,
    result:
      exactAgreement && evidenceComplete && safe && confidenceSufficient
        ? ("passed" as const)
        : ("review" as const),
  };
}

async function analysisImage(
  principal: Principal,
  row: ReceiptIntakeRow,
): Promise<{
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
}> {
  if (!row.analysis_object_key) {
    throw new Error("analysis image is unavailable");
  }
  const ownedPrefix = `receipt-intakes/${principal.ownerId}/${row.id}/`;
  if (!row.analysis_object_key.startsWith(ownedPrefix)) {
    throw new Error("analysis image is not owner scoped");
  }
  const object = await getReceiptsBucket().get(row.analysis_object_key);
  if (!object || (object.size && object.size > MAX_VERIFICATION_BYTES)) {
    throw new Error("analysis image is unavailable");
  }
  const bytes = new Uint8Array(
    await new Response(object.body).arrayBuffer(),
  );
  if (!bytes.length || bytes.length > MAX_VERIFICATION_BYTES) {
    throw new Error("analysis image is unavailable");
  }
  if (
    !object.customMetadata?.sha256 ||
    object.customMetadata.sha256 !== (await receiptSha256(bytes))
  ) {
    throw new Error("analysis image integrity check failed");
  }
  const contentType = validateImageType(bytes, null);
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new Error("analysis image is not verifiable");
  }
  return { bytes, contentType };
}

async function recordVerification(
  principal: Principal,
  row: ReceiptIntakeRow,
  audit: VerificationAudit,
  detail: {
    exactAgreement: boolean;
    evidenceComplete: boolean;
    safe: boolean;
  },
): Promise<void> {
  const history = safeJson<unknown[]>(row.analysis_history_json, []);
  history.push({
    verifiedAt: new Date().toISOString(),
    verification: {
      model: audit.verifierModel,
      result: audit.verifierResult,
      minimumConfidence: audit.verifierMinimumConfidence,
      exactAgreement: detail.exactAgreement,
      evidenceComplete: detail.evidenceComplete,
      safe: detail.safe,
    },
  });
  await database().batch([
    database()
      .prepare(
        `UPDATE receipt_intakes
         SET analysis_history_json = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND expense_id IS NULL`,
      )
      .bind(
        JSON.stringify(history.slice(-10)),
        principal.ownerId,
        row.id,
      ),
    auditStatement(principal, {
      action: "receipt_intake.auto_verified",
      entityType: "receipt_intake",
      entityId: row.id,
      metadata: {
        model: audit.verifierModel,
        result: audit.verifierResult,
        minimumConfidence: audit.verifierMinimumConfidence,
        exactAgreement: detail.exactAgreement,
        evidenceComplete: detail.evidenceComplete,
        safe: detail.safe,
      },
    }),
  ]);
}

export async function runReceiptAutoVerification(
  principal: Principal,
  row: ReceiptIntakeRow,
): Promise<{
  verification: ReceiptAutoVerification | null;
  audit: VerificationAudit;
}> {
  const fallbackModel = runtimeConfig().models.receipt;
  try {
    const image = await analysisImage(principal, row);
    await consumeAiQuota(principal, "receiptAnalysis", row.id);
    const verified = await verifyReceiptForAutoConfirmation(
      image.bytes,
      image.contentType,
      principal,
    );
    const detail = assessment(row, verified.verification);
    const audit: VerificationAudit = {
      verifierModel: verified.model,
      verifierResult: detail.result,
      verifierMinimumConfidence: detail.minimumConfidence,
    };
    await recordVerification(principal, row, audit, detail);
    return { verification: verified.verification, audit };
  } catch {
    const audit: VerificationAudit = {
      verifierModel: fallbackModel,
      verifierResult: "unavailable",
      verifierMinimumConfidence: null,
    };
    await recordVerification(principal, row, audit, {
      exactAgreement: false,
      evidenceComplete: false,
      safe: false,
    }).catch(() => {});
    return { verification: null, audit };
  }
}
