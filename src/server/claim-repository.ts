import { JSP_752_POLICY } from "@/src/domain/jsp752";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import { mapClaim, type ClaimRow } from "./models";

export async function listClaims() {
  await ensureSchema();
  const rows = await database()
    .prepare("SELECT * FROM claim_snapshots ORDER BY prepared_at DESC")
    .all<ClaimRow>();
  return rows.results.map(mapClaim);
}

async function hashSnapshot(snapshotJson: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(snapshotJson),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createClaimSnapshot(input: {
  period: string;
  expenses: unknown[];
  trips: unknown[];
  summary: {
    totalReceiptPence: number;
    totalGratuityPence: number;
    qualifyingActualPence: number;
    allowancePence: number;
    claimablePence: number;
  };
  calculation: unknown;
}) {
  await ensureSchema();
  const existing = await database()
    .prepare("SELECT id FROM claim_snapshots WHERE period = ?")
    .bind(input.period)
    .first<{ id: string }>();
  if (existing) {
    throw new ApiError(409, "claim_exists", "The August claim has already been prepared.");
  }
  const id = crypto.randomUUID();
  const snapshotJson = JSON.stringify({
    period: input.period,
    policy: JSP_752_POLICY,
    expenses: input.expenses,
    trips: input.trips,
    calculation: input.calculation,
  });
  const snapshotHash = await hashSnapshot(snapshotJson);
  await database()
    .prepare(
      `INSERT INTO claim_snapshots (
        id, period, status, policy_version, total_spend_pence,
        total_gratuity_pence, qualifying_actual_pence, allowance_pence,
        claimable_pence, snapshot_json, snapshot_sha256
      ) VALUES (?, ?, 'prepared', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.period,
      JSP_752_POLICY.version,
      input.summary.totalReceiptPence,
      input.summary.totalGratuityPence,
      input.summary.qualifyingActualPence,
      input.summary.allowancePence,
      input.summary.claimablePence,
      snapshotJson,
      snapshotHash,
    )
    .run();
  const row = await database()
    .prepare("SELECT * FROM claim_snapshots WHERE id = ?")
    .bind(id)
    .first<ClaimRow>();
  return mapClaim(row!);
}

export async function submitClaim(id: string) {
  await ensureSchema();
  await database()
    .prepare(
      `UPDATE claim_snapshots
       SET status = 'submitted',
           submitted_at = COALESCE(
             submitted_at,
             strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           )
       WHERE id = ?`,
    )
    .bind(id)
    .run();
  const row = await database()
    .prepare("SELECT * FROM claim_snapshots WHERE id = ?")
    .bind(id)
    .first<ClaimRow>();
  if (!row) {
    throw new ApiError(404, "not_found", "The claim was not found.");
  }
  return mapClaim(row);
}
