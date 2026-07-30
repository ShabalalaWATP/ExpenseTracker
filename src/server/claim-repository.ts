import { JSP_752_POLICY } from "@/src/domain/jsp752";
import { database, ensureSchema } from "./db";
import { ApiError } from "./http";
import { mapClaim, type ClaimRow } from "./models";
import type { Principal } from "./principal";
import { auditStatement } from "./audit-repository";

export async function listClaims(principal: Principal) {
  await ensureSchema();
  const rows = await database()
    .prepare(
      `SELECT * FROM claim_snapshots
       WHERE owner_id = ?
       ORDER BY prepared_at DESC`,
    )
    .bind(principal.ownerId)
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

export async function createClaimSnapshot(
  principal: Principal,
  input: {
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
  },
) {
  await ensureSchema();
  const existing = await database()
    .prepare(
      "SELECT id FROM claim_snapshots WHERE owner_id = ? AND period = ?",
    )
    .bind(principal.ownerId, input.period)
    .first<{ id: string }>();
  if (existing) {
    throw new ApiError(
      409,
      "claim_exists",
      `The ${input.period} claim has already been prepared.`,
    );
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
  const db = database();
  await db.batch([
    db
      .prepare(
        `INSERT INTO claim_snapshots (
          id, owner_id, period, status, policy_version, total_spend_pence,
          total_gratuity_pence, qualifying_actual_pence, allowance_pence,
          claimable_pence, snapshot_json, snapshot_sha256
        ) VALUES (?, ?, ?, 'prepared', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        principal.ownerId,
        input.period,
        JSP_752_POLICY.version,
        input.summary.totalReceiptPence,
        input.summary.totalGratuityPence,
        input.summary.qualifyingActualPence,
        input.summary.allowancePence,
        input.summary.claimablePence,
        snapshotJson,
        snapshotHash,
      ),
    auditStatement(principal, {
      action: "claim.prepared",
      entityType: "claim",
      entityId: id,
    }),
  ]);
  const row = await db
    .prepare(
      "SELECT * FROM claim_snapshots WHERE owner_id = ? AND id = ?",
    )
    .bind(principal.ownerId, id)
    .first<ClaimRow>();
  return mapClaim(row!);
}

export async function submitClaim(principal: Principal, id: string) {
  await ensureSchema();
  const db = database();
  const existing = await db
    .prepare(
      "SELECT id FROM claim_snapshots WHERE owner_id = ? AND id = ?",
    )
    .bind(principal.ownerId, id)
    .first<{ id: string }>();
  if (!existing) {
    throw new ApiError(404, "not_found", "The claim was not found.");
  }
  await db.batch([
    db
      .prepare(
        `UPDATE claim_snapshots
         SET status = 'submitted',
             submitted_at = COALESCE(
               submitted_at,
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             )
         WHERE owner_id = ? AND id = ?`,
      )
      .bind(principal.ownerId, id),
    auditStatement(principal, {
      action: "claim.submitted",
      entityType: "claim",
      entityId: id,
    }),
  ]);
  const row = await db
    .prepare(
      "SELECT * FROM claim_snapshots WHERE owner_id = ? AND id = ?",
    )
    .bind(principal.ownerId, id)
    .first<ClaimRow>();
  if (!row) {
    throw new ApiError(404, "not_found", "The claim was not found.");
  }
  return mapClaim(row);
}
