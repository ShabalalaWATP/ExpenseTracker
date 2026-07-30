// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { EXPENSE_CATEGORY_LABELS } from "../domain/expense-categories.ts";
import type { PolicyCalculation } from "../domain/jsp752.ts";
import type {
  AuditExpense,
  AuditObservation,
  AuditQuestion,
  AuditRange,
} from "./audit-findings.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { buildDocx, type DocxBlock } from "./docx.ts";

export type AuditClaimSummary = {
  period: string;
  status: string;
  claimablePence: number;
};

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function categoryLabel(category: string): string {
  return (
    (EXPENSE_CATEGORY_LABELS as Record<string, string>)[category] ?? "Food & drink"
  );
}

export function composeAuditDocx(input: {
  ownerEmail: string;
  range: AuditRange;
  expenses: readonly AuditExpense[];
  claims: readonly AuditClaimSummary[];
  calculation: PolicyCalculation;
  policyVersion: string;
  observations: readonly AuditObservation[];
  questions: readonly AuditQuestion[];
  answers: Record<string, string>;
  ai: { used: boolean; model: string; summary: string };
  createdAt: Date;
}): Uint8Array {
  const blocks: DocxBlock[] = [];
  const period = `${input.range.startDate} to ${input.range.endDate}`;

  blocks.push({ kind: "title", text: "ExpenseTracker audit response" });
  blocks.push({ kind: "pair", label: "Audited period", value: period });
  blocks.push({ kind: "pair", label: "Prepared for", value: input.ownerEmail });
  blocks.push({
    kind: "pair",
    label: "Prepared on",
    value: input.createdAt.toISOString().slice(0, 10),
  });
  blocks.push({ kind: "pair", label: "Policy basis", value: input.policyVersion });
  blocks.push({
    kind: "pair",
    label: "Review method",
    value: input.ai.used
      ? `Deterministic policy checks plus an AI ledger review (${input.ai.model}).`
      : "Deterministic policy checks. AI review was not available for this report.",
  });

  blocks.push({ kind: "heading", level: 1, text: "1. Scope and method" });
  blocks.push({
    kind: "paragraph",
    text:
      `This report covers every recorded expense with a service date between ${period}. ` +
      "Each expense was captured with its original receipt image where available, and amounts were " +
      "extracted at intake and confirmed by the claimant before entering the ledger.",
  });
  blocks.push({
    kind: "paragraph",
    text:
      "Food and drink is claimed within the daily subsistence allowance of £30. Taxi, public transport " +
      "and parking costs are claimed at actual cost and do not consume the daily allowance. " +
      "The findings section below records every point the review raised, together with the claimant's justification.",
  });
  if (input.ai.used && input.ai.summary) {
    blocks.push({ kind: "heading", level: 2, text: "AI reviewer summary" });
    blocks.push({ kind: "paragraph", text: input.ai.summary });
  }

  blocks.push({ kind: "heading", level: 1, text: "2. Financial summary" });
  blocks.push({
    kind: "table",
    header: ["Measure", "Amount"],
    rows: [
      ["Total receipted spend", money(input.calculation.totalSpendPence)],
      ["Eligible spend in scope", money(input.calculation.qualifyingActualPence)],
      ["Subsistence allowance available", money(input.calculation.allowancePence)],
      ["Claimable in scope", money(input.calculation.claimablePence)],
      ["Recorded gratuities", money(input.calculation.totalGratuityPence)],
    ],
  });
  const byCategory = new Map<string, { count: number; pence: number }>();
  for (const expense of input.expenses) {
    const entry = byCategory.get(expense.category) ?? { count: 0, pence: 0 };
    entry.count += 1;
    entry.pence += expense.eligiblePence;
    byCategory.set(expense.category, entry);
  }
  if (byCategory.size) {
    blocks.push({
      kind: "table",
      header: ["Category", "Receipts", "Eligible amount"],
      rows: [...byCategory.entries()].map(([category, entry]) => [
        categoryLabel(category),
        String(entry.count),
        money(entry.pence),
      ]),
    });
  }
  if (input.claims.length) {
    blocks.push({
      kind: "table",
      header: ["Claim period", "Status", "Claimable"],
      rows: input.claims.map((claim) => [
        claim.period,
        claim.status,
        money(claim.claimablePence),
      ]),
    });
  }

  blocks.push({ kind: "heading", level: 1, text: "3. Expense ledger" });
  if (input.expenses.length) {
    blocks.push({
      kind: "table",
      header: ["Date", "Merchant", "Category", "Eligible", "Claimable", "Receipt"],
      rows: [...input.expenses]
        .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
        .map((expense) => [
          expense.serviceDate,
          expense.merchant,
          categoryLabel(expense.category),
          money(expense.eligiblePence),
          money(expense.claimablePence),
          expense.hasReceipt ? "Stored" : "Missing",
        ]),
    });
  } else {
    blocks.push({
      kind: "paragraph",
      text: "No expenses were recorded in the audited period.",
      muted: true,
    });
  }

  blocks.push({ kind: "heading", level: 1, text: "4. Findings and justifications" });
  if (input.questions.length) {
    input.questions.forEach((question, index) => {
      blocks.push({
        kind: "heading",
        level: 2,
        text: `4.${index + 1} ${question.topic}`,
      });
      if (question.detail) {
        blocks.push({ kind: "paragraph", text: question.detail });
      }
      if (question.question) {
        blocks.push({ kind: "pair", label: "Auditor question", value: question.question });
      }
      blocks.push({
        kind: "pair",
        label: "Claimant justification",
        value:
          input.answers[question.id]?.trim() ||
          "No justification provided yet.",
      });
    });
  } else {
    blocks.push({
      kind: "paragraph",
      text: "The review raised no questions requiring justification.",
    });
  }
  if (input.observations.length) {
    blocks.push({ kind: "heading", level: 2, text: "Observations" });
    for (const observation of input.observations) {
      blocks.push({
        kind: "pair",
        label: observation.topic,
        value: observation.detail,
      });
    }
  }

  blocks.push({ kind: "heading", level: 1, text: "5. Evidence register" });
  blocks.push({
    kind: "table",
    header: ["Date", "Merchant", "Receipt evidence"],
    rows: [...input.expenses]
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
      .map((expense) => [
        expense.serviceDate,
        expense.merchant,
        expense.hasReceipt
          ? "Original image stored in ExpenseTracker"
          : "Not stored",
      ]),
  });

  blocks.push({ kind: "heading", level: 1, text: "6. Declaration" });
  blocks.push({
    kind: "paragraph",
    text:
      "I confirm that the expenses in this report were necessarily incurred on duty, that the justifications " +
      "above are accurate to the best of my knowledge, and that original receipts remain available on request.",
  });

  return buildDocx({
    title: `ExpenseTracker audit response ${period}`,
    author: input.ownerEmail,
    createdAt: input.createdAt,
    blocks,
  });
}
