import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { duplicateReason } from "@/src/domain/receipt-duplicate-match";

export type DuplicateCandidate = {
  id: string;
  kind: "expense" | "intake";
  merchant: string;
  serviceDate: string;
  receiptTotalPence: number;
  reason: string;
};

export type DuplicateCandidateState = {
  candidates: DuplicateCandidate[];
  fingerprint: string | null;
};

async function fingerprint(
  candidates: readonly DuplicateCandidate[],
): Promise<string | null> {
  if (!candidates.length) return null;
  const canonical = JSON.stringify(
    [...candidates]
      .map(({ id, kind, serviceDate, receiptTotalPence }) => ({
        id,
        kind,
        serviceDate,
        receiptTotalPence,
      }))
      .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type CandidateRow = {
  id: string;
  kind: "expense" | "intake";
  merchant: string;
  service_date: string;
  receipt_total_pence: number;
};

export async function findDuplicateCandidates(
  principal: Principal,
  intakeId: string,
  values: {
    merchant: string | null;
    serviceDate: string | null;
    receiptTotalPence: number | null;
  },
): Promise<DuplicateCandidate[]> {
  if (!values.merchant || !values.serviceDate || values.receiptTotalPence === null) {
    return [];
  }
  const result = await database()
    .prepare(
      `SELECT id, 'expense' AS kind, merchant, service_date, receipt_total_pence
       FROM expenses
       WHERE owner_id = ? AND deleted_at IS NULL
         AND (
           (service_date = ? AND receipt_total_pence = ?)
           OR (service_date = ? AND lower(merchant) = lower(?))
         )
       UNION ALL
       SELECT id, 'intake' AS kind, COALESCE(merchant, original_name),
              service_date, receipt_total_pence
       FROM receipt_intakes
       WHERE owner_id = ? AND id <> ? AND status <> 'confirmed'
         AND service_date IS NOT NULL AND receipt_total_pence IS NOT NULL
         AND (
           (service_date = ? AND receipt_total_pence = ?)
           OR (service_date = ? AND lower(COALESCE(merchant, original_name)) = lower(?))
         )
       LIMIT 8`,
    )
    .bind(
      principal.ownerId,
      values.serviceDate,
      values.receiptTotalPence,
      values.serviceDate,
      values.merchant,
      principal.ownerId,
      intakeId,
      values.serviceDate,
      values.receiptTotalPence,
      values.serviceDate,
      values.merchant,
    )
    .all<CandidateRow>();

  return result.results.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    merchant: candidate.merchant,
    serviceDate: candidate.service_date,
    receiptTotalPence: candidate.receipt_total_pence,
    reason: duplicateReason(candidate, {
      merchant: values.merchant!,
      serviceDate: values.serviceDate!,
      receiptTotalPence: values.receiptTotalPence!,
    }),
  }));
}

export async function refreshDuplicateCandidates(
  principal: Principal,
  intakeId: string,
  values: {
    merchant: string | null;
    serviceDate: string | null;
    receiptTotalPence: number | null;
  },
): Promise<DuplicateCandidate[]> {
  const { candidates, fingerprint: candidateFingerprint } =
    await duplicateCandidateState(principal, intakeId, values);
  await database()
    .prepare(
      `UPDATE receipt_intakes
       SET duplicate_candidates_json = ?,
           duplicate_fingerprint = ?,
           duplicate_reviewed = CASE
             WHEN ? IS NULL THEN 1
             WHEN duplicate_reviewed_fingerprint = ? THEN 1
             ELSE 0
           END
       WHERE owner_id = ? AND id = ?`,
    )
    .bind(
      JSON.stringify(candidates),
      candidateFingerprint,
      candidateFingerprint,
      candidateFingerprint,
      principal.ownerId,
      intakeId,
    )
    .run();
  return candidates;
}

export async function duplicateCandidateState(
  principal: Principal,
  intakeId: string,
  values: {
    merchant: string | null;
    serviceDate: string | null;
    receiptTotalPence: number | null;
  },
): Promise<DuplicateCandidateState> {
  const candidates = await findDuplicateCandidates(principal, intakeId, values);
  return { candidates, fingerprint: await fingerprint(candidates) };
}

export async function assertDuplicatesReviewed(
  principal: Principal,
  intakeId: string,
  values: {
    merchant: string | null;
    serviceDate: string | null;
    receiptTotalPence: number | null;
  },
): Promise<void> {
  const candidates = await findDuplicateCandidates(
    principal,
    intakeId,
    values,
  );
  const candidateFingerprint = await fingerprint(candidates);
  const row = await database()
    .prepare(
      `SELECT duplicate_reviewed_fingerprint
       FROM receipt_intakes WHERE owner_id = ? AND id = ?`,
    )
    .bind(principal.ownerId, intakeId)
    .first<{ duplicate_reviewed_fingerprint: string | null }>();
  if (
    candidateFingerprint &&
    row?.duplicate_reviewed_fingerprint !== candidateFingerprint
  ) {
    await refreshDuplicateCandidates(principal, intakeId, values);
    throw new ApiError(
      409,
      "duplicate_review_required",
      "Review the possible duplicate receipt before confirming this expense.",
      { candidates },
    );
  }
}
