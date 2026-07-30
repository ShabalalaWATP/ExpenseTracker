import { auditStatementAfterChange } from "./audit-repository";
import { database } from "./db";
import type { Principal } from "./principal";

export async function recoverExpiredReceiptAnalysis(
  principal: Principal,
  id: string,
  analysisToken: string,
): Promise<boolean> {
  const results = await database().batch<{ id: string }>([
    database()
      .prepare(
        `UPDATE receipt_intakes
         SET status = 'needs_review',
             error_code = 'receipt_processing_interrupted',
             error_message = 'Receipt processing was interrupted. Remove it or retry the analysis.',
             analysis_token = NULL, analysis_lease_expires_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE owner_id = ? AND id = ? AND status = 'analysing'
           AND expense_id IS NULL AND analysis_token = ?
           AND analysis_lease_expires_at <=
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         RETURNING id`,
      )
      .bind(principal.ownerId, id, analysisToken),
    auditStatementAfterChange(principal, {
      action: "receipt_intake.analysis_recovered",
      entityType: "receipt_intake",
      entityId: id,
      metadata: { reason: "expired_analysis_lease" },
    }),
  ]);
  return results[0]?.results?.some((row) => row.id === id) ?? false;
}
