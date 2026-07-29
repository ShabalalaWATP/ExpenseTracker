import { getReceiptsBucket } from "@/db";
import { partitionByByteSize } from "@/src/domain/byte-partitions";
import { database, ensureSchema } from "./db";
import { sha256Hex, streamBytes, utf8 } from "./binary";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { buildTextPdf } from "./simple-pdf";
import { buildZip, type ZipEntry } from "./zip";

type SnapshotExpense = {
  id: string;
  serviceDate: string;
  merchant: string;
  location: string;
  businessReason: string;
  receiptTotalPence: number;
  eligiblePence: number;
  gratuityPence: number;
  receipt?: { id: string } | null;
};

type ClaimRecord = {
  id: string;
  period: string;
  status: string;
  snapshot_json: string;
  snapshot_sha256: string;
  claimable_pence: number;
  prepared_at: string;
};

type ReceiptRecord = {
  id: string;
  expense_id: string;
  object_key: string;
  content_type: string;
  byte_size: number;
  sha256: string;
};

type ManifestReceipt = Omit<ReceiptRecord, "object_key"> & {
  archivePath: string;
  part: number;
};

const MAX_CLAIM_PART_BYTES = 25 * 1024 * 1024;

export type ClaimPackagePlan = {
  period: string;
  totalBytes: number;
  evidenceCount: number;
  parts: Array<{ part: number; byteSize: number; evidenceCount: number }>;
};

function safePart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "receipt";
}

function extension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/heif") return "heif";
  return contentType === "image/heic" ? "heic" : "jpg";
}

function money(pence: number): string {
  return `GBP ${(pence / 100).toFixed(2)}`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

async function claimRecord(principal: Principal, id: string): Promise<ClaimRecord> {
  await ensureSchema();
  const row = await database()
    .prepare(
      `SELECT id, period, status, snapshot_json, snapshot_sha256,
              claimable_pence, prepared_at
       FROM claim_snapshots WHERE owner_id = ? AND id = ?`,
    )
    .bind(principal.ownerId, id)
    .first<ClaimRecord>();
  if (!row) throw new ApiError(404, "not_found", "The claim was not found.");
  if ((await sha256Hex(utf8(row.snapshot_json))) !== row.snapshot_sha256) {
    throw new ApiError(
      409,
      "snapshot_integrity_failed",
      "The frozen claim snapshot failed its integrity check.",
    );
  }
  return row;
}

function parseExpenses(snapshotJson: string): SnapshotExpense[] {
  try {
    const parsed = JSON.parse(snapshotJson) as { expenses?: unknown };
    if (!Array.isArray(parsed.expenses)) throw new Error("missing expenses");
    return parsed.expenses.filter(
      (value): value is SnapshotExpense =>
        Boolean(value) &&
        typeof value === "object" &&
        typeof (value as SnapshotExpense).id === "string",
    );
  } catch {
    throw new ApiError(409, "snapshot_invalid", "The frozen claim snapshot is invalid.");
  }
}

async function receipts(
  principal: Principal,
  expenses: readonly SnapshotExpense[],
): Promise<Map<string, ReceiptRecord>> {
  if (!expenses.length) return new Map();
  const rows: ReceiptRecord[] = [];
  for (let offset = 0; offset < expenses.length; offset += 99) {
    const chunk = expenses.slice(offset, offset + 99);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await database()
      .prepare(
        `SELECT id, expense_id, object_key, content_type, byte_size, sha256
         FROM receipts
         WHERE owner_id = ? AND expense_id IN (${placeholders})`,
      )
      .bind(principal.ownerId, ...chunk.map((expense) => expense.id))
      .all<ReceiptRecord>();
    rows.push(...result.results);
  }
  return new Map(rows.map((row) => [row.expense_id, row]));
}

function reportLines(claim: ClaimRecord, expenses: readonly SnapshotExpense[]): string[] {
  return [
    "ExpenseTracker claim summary",
    `Period: ${claim.period}`,
    `Status: ${claim.status}`,
    `Prepared: ${claim.prepared_at}`,
    `Claimable: ${money(claim.claimable_pence)}`,
    "",
    ...expenses.flatMap((expense, index) => [
      `${index + 1}. ${expense.serviceDate} | ${expense.merchant} | ${money(expense.eligiblePence)}`,
      `   Where: ${expense.location || "Not recorded"}`,
      `   Why: ${expense.businessReason || "Not recorded"}`,
    ]),
  ];
}

async function packageData(principal: Principal, id: string) {
  const claim = await claimRecord(principal, id);
  const expenses = parseExpenses(claim.snapshot_json);
  const receiptRows = await receipts(principal, expenses);
  const missing = expenses.filter((expense) => !receiptRows.has(expense.id));
  if (missing.length) {
    throw new ApiError(
      409,
      "package_evidence_missing",
      "One or more frozen expenses no longer has receipt evidence.",
      missing.map((expense) => expense.id),
    );
  }
  return { claim, expenses, receiptRows };
}

function packageParts(
  expenses: readonly SnapshotExpense[],
  receiptRows: ReadonlyMap<string, ReceiptRecord>,
): SnapshotExpense[][] {
  return partitionByByteSize(
    expenses,
    (expense) => receiptRows.get(expense.id)!.byte_size,
    MAX_CLAIM_PART_BYTES,
  );
}

export async function getClaimPackagePlan(
  principal: Principal,
  id: string,
): Promise<ClaimPackagePlan> {
  const { claim, expenses, receiptRows } = await packageData(principal, id);
  const parts = packageParts(expenses, receiptRows);
  return {
    period: claim.period,
    totalBytes: expenses.reduce(
      (sum, expense) => sum + receiptRows.get(expense.id)!.byte_size,
      0,
    ),
    evidenceCount: expenses.length,
    parts: parts.map((rows, index) => ({
      part: index + 1,
      byteSize: rows.reduce(
        (sum, expense) => sum + receiptRows.get(expense.id)!.byte_size,
        0,
      ),
      evidenceCount: rows.length,
    })),
  };
}

export async function buildClaimPackage(
  principal: Principal,
  id: string,
  requestedPart = 1,
): Promise<{ bytes: Uint8Array; period: string; partCount: number }> {
  const { claim, expenses, receiptRows } = await packageData(principal, id);
  const parts = packageParts(expenses, receiptRows);
  if (
    !Number.isSafeInteger(requestedPart) ||
    requestedPart < 1 ||
    requestedPart > parts.length
  ) {
    throw new ApiError(
      404,
      "package_part_not_found",
      "That submission package part does not exist.",
    );
  }
  const selectedExpenses = parts[requestedPart - 1];
  const bucket = getReceiptsBucket();
  const entries: ZipEntry[] = [];
  const manifestReceipts: ManifestReceipt[] = expenses.map((expense, index) => {
    const row = receiptRows.get(expense.id)!;
    return {
      id: row.id,
      expense_id: row.expense_id,
      content_type: row.content_type,
      byte_size: row.byte_size,
      sha256: row.sha256,
      archivePath: `receipts/${String(index + 1).padStart(2, "0")}-${expense.serviceDate}-${safePart(expense.merchant)}.${extension(row.content_type)}`,
      part: parts.findIndex((part) => part.includes(expense)) + 1,
    };
  });
  const manifestByExpense = new Map(
    manifestReceipts.map((row) => [row.expense_id, row]),
  );
  for (const expense of selectedExpenses) {
    const row = receiptRows.get(expense.id)!;
    const head = await bucket.head(row.object_key);
    if (!head || head.size !== row.byte_size) {
      throw new ApiError(
        409,
        "package_evidence_unavailable",
        `Receipt evidence is unavailable for ${expense.merchant}.`,
      );
    }
    const object = await bucket.get(row.object_key);
    if (!object) throw new ApiError(409, "package_evidence_unavailable", "Receipt evidence is unavailable.");
    const bytes = await streamBytes(object.body);
    if ((await sha256Hex(bytes)) !== row.sha256) {
      throw new ApiError(409, "package_evidence_integrity_failed", "Receipt evidence failed its integrity check.");
    }
    const archivePath = manifestByExpense.get(expense.id)!.archivePath;
    entries.push({
      name: archivePath,
      data: bytes,
    });
  }
  const headers = ["date", "merchant", "location", "reason", "receipt_total_gbp", "eligible_gbp", "gratuity_gbp"];
  const csv = [
    headers.map(csvCell).join(","),
    ...expenses.map((expense) =>
      [
        expense.serviceDate,
        expense.merchant,
        expense.location,
        expense.businessReason,
        (expense.receiptTotalPence / 100).toFixed(2),
        (expense.eligiblePence / 100).toFixed(2),
        (expense.gratuityPence / 100).toFixed(2),
      ].map(csvCell).join(","),
    ),
  ].join("\r\n");
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    claim: {
      id: claim.id,
      period: claim.period,
      status: claim.status,
      snapshotSha256: claim.snapshot_sha256,
    },
    package: { part: requestedPart, partCount: parts.length },
    receipts: manifestReceipts.map((row) => ({
      id: row.id,
      expenseId: row.expense_id,
      contentType: row.content_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      archivePath: row.archivePath,
      part: row.part,
    })),
  };
  entries.unshift(
    { name: "claim-summary.pdf", data: buildTextPdf(reportLines(claim, expenses)) },
    { name: "expense-register.csv", data: utf8(`\uFEFF${csv}`) },
    { name: "manifest.json", data: utf8(JSON.stringify(manifest, null, 2)) },
  );
  return {
    bytes: buildZip(entries),
    period: claim.period,
    partCount: parts.length,
  };
}
