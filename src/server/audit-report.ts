import {
  calculateJsp752,
  JSP_752_POLICY,
  type PolicyExpense,
  type PolicyTrip,
} from "@/src/domain/jsp752";
import { getReceiptsBucket } from "@/db";
import {
  auditRangeIssue,
  MAX_AUDIT_QUESTIONS,
  ruleFindings,
  type AuditExpense,
  type AuditObservation,
  type AuditQuestion,
  type AuditRange,
} from "./audit-findings";
import { ApiError } from "./http";
import { composeAuditDocx } from "./audit-report-docx";
import { auditStatement } from "./audit-repository";
import { listClaims } from "./claim-repository";
import { database } from "./db";
import { listExpenses } from "./expense-repository";
import { auditLedgerReview } from "./audit-ai";
import {
  loadAuditReceiptEvidence,
  type AuditReceiptRecord,
} from "./audit-receipt-evidence";
import type { Principal } from "./principal";
import { listTrips } from "./trip-repository";
import { directReceiptPreviewObjectKey } from "@/src/domain/receipt-evidence";

const MAX_TEXT = 2_000;

type AuditReceiptRow = {
  id: string;
  owner_id: string;
  expense_id: string;
  object_key: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  analysis_object_key: string | null;
};

function boundedText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : fallback;
}

export function parseAuditRange(value: unknown): AuditRange {
  if (!value || typeof value !== "object") {
    throw new ApiError(400, "validation_failed", "The audit request is invalid.");
  }
  const input = value as Record<string, unknown>;
  const issue = auditRangeIssue(input.startDate, input.endDate);
  if (issue) throw new ApiError(400, "validation_failed", issue);
  return {
    startDate: input.startDate as string,
    endDate: input.endDate as string,
  };
}

export function parseAuditQuestions(value: unknown): AuditQuestion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_AUDIT_QUESTIONS) {
    throw new ApiError(400, "validation_failed", "The audit answers are invalid.");
  }
  return value.map((raw, index) => {
    const item =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      id: boundedText(item.id, `question-${index + 1}`).slice(0, 80),
      source: item.source === "ai" ? ("ai" as const) : ("rule" as const),
      expenseId:
        typeof item.expenseId === "string" && item.expenseId
          ? item.expenseId.slice(0, 80)
          : null,
      topic: boundedText(item.topic, "Finding"),
      detail: boundedText(item.detail),
      question: boundedText(item.question),
    };
  });
}

export function parseAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) {
      result[key.slice(0, 80)] = raw.trim().slice(0, MAX_TEXT);
    }
  }
  return result;
}

export async function auditRangeData(principal: Principal, range: AuditRange) {
  const [allExpenses, trips, claims] = await Promise.all([
    listExpenses(principal),
    listTrips(principal),
    listClaims(principal),
  ]);
  const inRange = allExpenses.filter(
    (expense) =>
      expense.serviceDate >= range.startDate &&
      expense.serviceDate <= range.endDate,
  );
  const policyTrips: PolicyTrip[] = trips.map((trip) => ({
    id: trip.id,
    startDate: trip.startDate,
    endDate: trip.endDate,
    country: trip.country,
    aggregateElection: trip.aggregateElection,
    days: trip.days
      .filter((day) => day.date >= range.startDate && day.date <= range.endDate)
      .map((day) => ({
        date: day.date,
        eligible: day.eligible,
        confirmed: day.confirmed,
      })),
  }));
  const policyExpenses: PolicyExpense[] = inRange.map((expense) => ({
    id: expense.id,
    serviceDate: expense.serviceDate,
    receiptTotalPence: expense.receiptTotalPence,
    eligiblePence: expense.eligiblePence,
    gratuityPence: expense.gratuityPence,
    currency: expense.currency,
    country: expense.country,
    tripId: expense.tripId,
    hasReceipt: Boolean(expense.receipt),
    category: expense.category,
  }));
  const calculation = calculateJsp752(policyTrips, policyExpenses);
  const lineByExpense = new Map(
    calculation.lines.map((line) => [line.expenseId, line]),
  );
  const expenses: AuditExpense[] = inRange.map((expense) => {
    const line = lineByExpense.get(expense.id);
    return {
      id: expense.id,
      serviceDate: expense.serviceDate,
      merchant: expense.merchant,
      location: expense.location || null,
      businessReason: expense.businessReason || null,
      receiptTotalPence: expense.receiptTotalPence,
      eligiblePence: expense.eligiblePence,
      gratuityPence: expense.gratuityPence,
      originalCurrency: expense.originalCurrency ?? "GBP",
      originalCountry: expense.originalCountry ?? "GB",
      originalLanguage: expense.originalLanguage ?? "und",
      originalReceiptTotalMinor:
        expense.originalReceiptTotalMinor ?? expense.receiptTotalPence,
      originalEligibleMinor:
        expense.originalEligibleMinor ?? expense.eligiblePence,
      originalGratuityMinor:
        expense.originalGratuityMinor ?? expense.gratuityPence,
      originalMinorUnitDigits: expense.originalMinorUnitDigits ?? 2,
      translation: expense.translation ?? {},
      conversion: expense.conversion ?? {},
      category: expense.category,
      mealContext: expense.mealContext || null,
      tripId: expense.tripId,
      tripLegId: expense.tripLegId ?? null,
      hasReceipt: Boolean(expense.receipt),
      claimablePence: line?.claimablePence ?? 0,
      capLimited: line?.reason === "Daily allowance reached",
    };
  });
  const periods = new Set(
    expenses.map((expense) => expense.serviceDate.slice(0, 7)),
  );
  return {
    expenses,
    trips,
    claims: claims
      .filter((claim) => periods.has(claim.period))
      .map((claim) => ({
        period: claim.period,
        status: claim.status,
        claimablePence: claim.claimablePence,
      })),
    calculation,
  };
}

export async function planAuditReport(principal: Principal, range: AuditRange) {
  const data = await auditRangeData(principal, range);
  const rules = ruleFindings(data.expenses, data.calculation);
  const aiQuestions: AuditQuestion[] = [];
  const aiObservations: AuditObservation[] = [];
  let aiSummary = "";
  let aiModel = "";
  let aiUsed = false;
  if (data.expenses.length) {
    try {
      const review = await auditLedgerReview(principal, {
        policy: JSP_752_POLICY,
        range,
        expenses: data.expenses,
        trips: data.trips.map((trip) => ({
          id: trip.id,
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          aggregateElection: trip.aggregateElection,
          legs: trip.legs.map((leg) => ({
            countryCode: leg.countryCode,
            location: leg.location,
            startDate: leg.startDate,
            endDate: leg.endDate,
          })),
        })),
        knownIssueCodes: data.calculation.issues.map((issue) => issue.code),
      });
      aiUsed = true;
      aiModel = review.model;
      aiSummary = review.summary;
      review.findings.forEach((finding, index) => {
        if (finding.severity === "question" && finding.question) {
          aiQuestions.push({
            id: `ai-${index + 1}`,
            source: "ai",
            expenseId: finding.expenseId,
            topic: finding.topic,
            detail: finding.detail,
            question: finding.question,
          });
        } else {
          aiObservations.push({ topic: finding.topic, detail: finding.detail });
        }
      });
    } catch {
      // The report degrades to deterministic checks when AI is unavailable.
    }
  }
  return {
    range,
    expenseCount: data.expenses.length,
    totals: {
      totalSpendPence: data.calculation.totalSpendPence,
      qualifyingActualPence: data.calculation.qualifyingActualPence,
      allowancePence: data.calculation.allowancePence,
      claimablePence: data.calculation.claimablePence,
    },
    questions: [...rules.questions, ...aiQuestions].slice(
      0,
      MAX_AUDIT_QUESTIONS,
    ),
    observations: [...rules.observations, ...aiObservations],
    ai: { used: aiUsed, model: aiModel, summary: aiSummary },
  };
}

async function auditReceiptRecords(
  principal: Principal,
  expenseIds: readonly string[],
): Promise<Map<string, AuditReceiptRecord>> {
  const rows: AuditReceiptRow[] = [];
  for (let offset = 0; offset < expenseIds.length; offset += 99) {
    const chunk = expenseIds.slice(offset, offset + 99);
    const placeholders = chunk.map(() => "?").join(",");
    const result = await database()
      .prepare(
        `SELECT
           r.id, r.owner_id, r.expense_id, r.object_key, r.content_type,
           r.byte_size, r.sha256,
           (
             SELECT ri.analysis_object_key
             FROM receipt_intakes ri
             WHERE ri.owner_id = r.owner_id
               AND ri.expense_id = r.expense_id
               AND ri.analysis_object_key IS NOT NULL
             ORDER BY ri.updated_at DESC
             LIMIT 1
           ) AS analysis_object_key
         FROM receipts r
         WHERE r.owner_id = ? AND r.expense_id IN (${placeholders})`,
      )
      .bind(principal.ownerId, ...chunk)
      .all<AuditReceiptRow>();
    rows.push(...result.results);
  }
  return new Map(
    rows.map((row) => [
      row.expense_id,
      {
        receiptId: row.id,
        ownerId: row.owner_id,
        expenseId: row.expense_id,
        objectKey: row.object_key,
        contentType: row.content_type,
        byteSize: row.byte_size,
        sha256: row.sha256,
        analysisObjectKey:
          row.analysis_object_key ??
          (row.content_type === "image/heic" ||
          row.content_type === "image/heif"
            ? directReceiptPreviewObjectKey(row.owner_id, row.id)
            : null),
      },
    ]),
  );
}

export async function generateAuditReport(
  principal: Principal,
  input: {
    range: AuditRange;
    questions: AuditQuestion[];
    answers: Record<string, string>;
    ai: { used: boolean; model: string; summary: string };
  },
) {
  const data = await auditRangeData(principal, input.range);
  const rules = ruleFindings(data.expenses, data.calculation);
  const receiptRecords = await auditReceiptRecords(
    principal,
    data.expenses.map((expense) => expense.id),
  );
  const evidence = await loadAuditReceiptEvidence(
    principal.ownerId,
    data.expenses,
    receiptRecords,
    getReceiptsBucket(),
  );
  const bytes = composeAuditDocx({
    ownerEmail: principal.email,
    range: input.range,
    expenses: data.expenses,
    trips: data.trips,
    claims: data.claims,
    calculation: data.calculation,
    policyVersion: JSP_752_POLICY.version,
    observations: rules.observations,
    questions: input.questions,
    answers: input.answers,
    ai: input.ai,
    createdAt: new Date(),
    evidence,
  });
  await database()
    .batch([
      auditStatement(principal, {
        action: "audit_report.generated",
        entityType: "audit_report",
        entityId: `${input.range.startDate}..${input.range.endDate}`,
        metadata: {
          expenseCount: data.expenses.length,
          questionCount: input.questions.length,
          aiAssisted: input.ai.used,
          embeddedReceiptCount: evidence.filter(
            (item) => item.status === "embedded",
          ).length,
          excludedReceiptCount: evidence.filter(
            (item) => item.status !== "embedded",
          ).length,
        },
      }),
    ])
    .catch(() => {});
  return {
    bytes,
    filename: `ExpenseTracker-audit-${input.range.startDate}-to-${input.range.endDate}.docx`,
  };
}
