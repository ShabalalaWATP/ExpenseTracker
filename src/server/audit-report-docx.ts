// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { EXPENSE_CATEGORY_LABELS } from "../domain/expense-categories.ts";
import type { PolicyCalculation } from "../domain/jsp752.ts";
import type {
  AuditExpense,
  AuditObservation,
  AuditQuestion,
  AuditRange,
} from "./audit-findings.ts";
import type { AuditReceiptEvidence } from "./audit-receipt-evidence.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension in direct tests.
import { buildDocx, type DocxBlock, type DocxImage } from "./docx.ts";

export type AuditClaimSummary = {
  period: string;
  status: string;
  claimablePence: number;
};

export type AuditTripSummary = {
  id: string;
  name: string;
  purpose: string | null;
  startDate: string;
  endDate: string;
  legs: readonly {
    countryCode: string;
    location: string;
    startDate: string;
    endDate: string;
  }[];
};

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function categoryLabel(category: string): string {
  return (
    (EXPENSE_CATEGORY_LABELS as Record<string, string>)[category] ?? "Food & drink"
  );
}

function originalMoney(
  minor: number,
  currency: string,
  digits: number,
): string {
  const exponent =
    Number.isSafeInteger(digits) && digits >= 0 && digits <= 4 ? digits : 2;
  return `${currency} ${(minor / 10 ** exponent).toFixed(exponent)}`;
}

function conversionSummary(expense: AuditExpense): string {
  if (expense.originalCurrency === "GBP") return "GBP identity conversion";
  const source =
    expense.conversion.provider ??
    expense.conversion.source ??
    "Conversion source not recorded";
  const date = expense.conversion.observationDate
    ? `, observation ${expense.conversion.observationDate}`
    : "";
  const rate = expense.conversion.rateDisplay
    ? `, 1 ${expense.originalCurrency} = ${expense.conversion.rateDisplay} GBP`
    : "";
  return `${source}${date}${rate}, ${expense.conversion.rounding ?? "half-up"} rounding`;
}

export function composeAuditDocx(input: {
  ownerEmail: string;
  range: AuditRange;
  expenses: readonly AuditExpense[];
  trips?: readonly AuditTripSummary[];
  claims: readonly AuditClaimSummary[];
  calculation: PolicyCalculation;
  policyVersion: string;
  observations: readonly AuditObservation[];
  questions: readonly AuditQuestion[];
  answers: Record<string, string>;
  ai: { used: boolean; model: string; summary: string };
  createdAt: Date;
  evidence?: readonly AuditReceiptEvidence[];
}): Uint8Array {
  const blocks: DocxBlock[] = [];
  const period = `${input.range.startDate} to ${input.range.endDate}`;
  const evidenceByExpense = new Map(
    (input.evidence ?? []).map((item) => [item.expenseId, item]),
  );
  const images: DocxImage[] = [];

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
      "extracted at intake, independently verified where automatically accepted, and preserved in the original currency alongside the frozen GBP policy value.",
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
  const itinerary = (input.trips ?? []).filter(
    (trip) =>
      trip.endDate >= input.range.startDate &&
      trip.startDate <= input.range.endDate,
  );
  if (itinerary.length) {
    blocks.push({ kind: "heading", level: 2, text: "Trip itineraries" });
    blocks.push({
      kind: "table",
      header: ["Trip", "Country and location legs", "Overall dates"],
      rows: itinerary.map((trip) => [
        trip.name,
        trip.legs
          .map(
            (leg) =>
              `${leg.countryCode}: ${leg.location} (${leg.startDate} to ${leg.endDate})`,
          )
          .join("; "),
        `${trip.startDate} to ${trip.endDate}`,
      ]),
    });
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
      header: [
        "Date",
        "Merchant",
        "Country",
        "Original eligible",
        "Eligible GBP",
        "Claimable",
        "Receipt",
      ],
      rows: [...input.expenses]
        .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
        .map((expense) => [
          expense.serviceDate,
          expense.merchant,
          expense.originalCountry,
          originalMoney(
            expense.originalEligibleMinor,
            expense.originalCurrency,
            expense.originalMinorUnitDigits,
          ),
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
        evidenceByExpense.get(expense.id)?.detail ??
          (expense.hasReceipt
            ? "Stored in ExpenseTracker, but not loaded into this report."
            : "No receipt image is attached to this expense."),
      ]),
  });

  blocks.push({ kind: "heading", level: 1, text: "6. Receipt evidence appendix" });
  const orderedExpenses = [...input.expenses].sort((a, b) =>
    a.serviceDate.localeCompare(b.serviceDate),
  );
  if (!orderedExpenses.length) {
    blocks.push({
      kind: "paragraph",
      text: "There are no expenses in scope, so no receipt evidence is included.",
      muted: true,
    });
  }
  orderedExpenses.forEach((expense, index) => {
    const evidence = evidenceByExpense.get(expense.id);
    blocks.push({
      kind: "heading",
      level: 2,
      text: `6.${index + 1} ${expense.serviceDate} - ${expense.merchant}`,
    });
    blocks.push({
      kind: "pair",
      label: "Expense",
      value:
        `${categoryLabel(expense.category)}, ` +
        `${originalMoney(
          expense.originalEligibleMinor,
          expense.originalCurrency,
          expense.originalMinorUnitDigits,
        )} original; ${money(expense.eligiblePence)} GBP policy equivalent`,
    });
    blocks.push({
      kind: "pair",
      label: "Receipt locale",
      value:
        `${expense.originalCountry}, language ${expense.originalLanguage}; ` +
        conversionSummary(expense),
    });
    const englishSummary =
      expense.translation.summaryEnglish ??
      expense.translation.businessReason ??
      expense.translation.locationEnglish ??
      expense.translation.locationHint;
    if (englishSummary) {
      blocks.push({
        kind: "pair",
        label: "English translation",
        value: englishSummary,
      });
    }
    if (evidence?.original) {
      blocks.push({
        kind: "pair",
        label: "Immutable original",
        value:
          `${evidence.original.contentType}, ${evidence.original.byteSize} bytes; ` +
          `SHA-256 ${evidence.original.sha256}`,
      });
    }
    if (evidence?.status === "embedded" && evidence.image) {
      const imageKey = `receipt-${expense.id}`;
      images.push({
        key: imageKey,
        data: evidence.image.bytes,
        contentType: evidence.image.contentType,
        widthPx: evidence.image.widthPx,
        heightPx: evidence.image.heightPx,
      });
      blocks.push({
        kind: "pair",
        label: "Evidence source",
        value:
          evidence.image.source === "analysis"
            ? "Secure analysis copy (JPEG/PNG)"
            : evidence.image.source === "owner_preview"
              ? "Owner-supplied browser-created JPEG preview (non-authoritative; not the immutable original)"
              : "Secure original receipt (JPEG/PNG)",
      });
      blocks.push({
        kind: "image",
        imageKey,
        altText: `Receipt for ${expense.merchant} dated ${expense.serviceDate}`,
      });
    } else {
      blocks.push({
        kind: "paragraph",
        text: `Image not embedded: ${
          evidence?.detail ??
          (expense.hasReceipt
            ? "the stored receipt could not be loaded into this report."
            : "no receipt image is attached to this expense.")
        }`,
        muted: true,
      });
    }
  });

  blocks.push({ kind: "heading", level: 1, text: "7. Declaration" });
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
    images,
  });
}
