import { getReceiptsBucket } from "@/db";
import { APP_VERSION, DATABASE_SCHEMA_VERSION } from "@/src/app-version";
import { database, ensureSchema } from "./db";
import type { Principal } from "./principal";
import { publicAiStatus } from "./runtime-config";

type Counts = {
  expense_count: number;
  receipt_count: number;
  receipt_bytes: number;
  pending_intakes: number;
};

type RecentAnalysis = {
  action: string;
  created_at: string;
  metadata_json: string;
};

type RecentError = {
  error_code: string;
  error_message: string;
  updated_at: string;
};

export async function operationalStatus(principal: Principal) {
  await ensureSchema();
  const db = database();
  const [counts, latestAnalysis, latestError, latestReceipt] = await Promise.all([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM expenses WHERE owner_id = ? AND deleted_at IS NULL) AS expense_count,
           (SELECT COUNT(*) FROM receipts WHERE owner_id = ?) AS receipt_count,
           (SELECT COALESCE(SUM(byte_size), 0) FROM receipts WHERE owner_id = ?) AS receipt_bytes,
           (SELECT COUNT(*) FROM receipt_intakes
            WHERE owner_id = ? AND status NOT IN ('confirmed', 'failed')) AS pending_intakes`,
      )
      .bind(
        principal.ownerId,
        principal.ownerId,
        principal.ownerId,
        principal.ownerId,
      )
      .first<Counts>(),
    db
      .prepare(
        `SELECT action, created_at, metadata_json
         FROM audit_events
         WHERE owner_id = ?
           AND action IN ('receipt_intake.analysed', 'receipt_intake.field_reanalysed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(principal.ownerId)
      .first<RecentAnalysis>(),
    db
      .prepare(
        `SELECT error_code, error_message, updated_at
         FROM receipt_intakes
         WHERE owner_id = ? AND error_code IS NOT NULL
           AND error_code <> 'receipt_trip_ambiguous'
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .bind(principal.ownerId)
      .first<RecentError>(),
    db
      .prepare(
        `SELECT object_key, byte_size FROM receipts
         WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(principal.ownerId)
      .first<{ object_key: string; byte_size: number }>(),
  ]);
  let storage = { configured: true, verified: true, detail: "Ready" };
  try {
    if (latestReceipt) {
      const head = await getReceiptsBucket().head(latestReceipt.object_key);
      storage = {
        configured: true,
        verified: Boolean(head && head.size === latestReceipt.byte_size),
        detail: head ? "Latest receipt verified" : "Latest receipt is unavailable",
      };
    } else {
      await getReceiptsBucket().list({ limit: 1 });
      storage.detail = "Ready, no receipts stored yet";
    }
  } catch {
    storage = {
      configured: true,
      verified: false,
      detail: "Storage check failed",
    };
  }
  let analysisMetadata: Record<string, unknown> = {};
  try {
    analysisMetadata = latestAnalysis
      ? JSON.parse(latestAnalysis.metadata_json) as Record<string, unknown>
      : {};
  } catch {
    analysisMetadata = {};
  }
  return {
    version: APP_VERSION,
    databaseSchema: DATABASE_SCHEMA_VERSION,
    checkedAt: new Date().toISOString(),
    database: { configured: true, verified: true, detail: "Connected" },
    storage,
    ai: {
      ...publicAiStatus(),
      lastSuccessAt: latestAnalysis?.created_at ?? null,
      lastSuccessModel:
        typeof analysisMetadata.model === "string"
          ? analysisMetadata.model
          : null,
      lastError: latestError
        ? {
            code: latestError.error_code,
            message: latestError.error_message,
            at: latestError.updated_at,
          }
        : null,
    },
    usage: {
      expenses: counts?.expense_count ?? 0,
      receipts: counts?.receipt_count ?? 0,
      receiptBytes: counts?.receipt_bytes ?? 0,
      pendingIntakes: counts?.pending_intakes ?? 0,
    },
  };
}
