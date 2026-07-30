import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { auditRangeIssue, ruleFindings, type AuditExpense } from "../src/server/audit-findings.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { composeAuditDocx } from "../src/server/audit-report-docx.ts";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { buildDocx, escapeXml } from "../src/server/docx.ts";
import type { PolicyCalculation } from "../src/domain/jsp752.ts";

const calculation = (
  overrides: Partial<PolicyCalculation> = {},
): PolicyCalculation => ({
  totalSpendPence: 5_000,
  totalGratuityPence: 0,
  qualifyingActualPence: 5_000,
  allowancePence: 3_000,
  claimablePence: 3_000,
  lines: [],
  issues: [],
  ...overrides,
});

const auditExpense = (
  id: string,
  overrides: Partial<AuditExpense> = {},
): AuditExpense => ({
  id,
  serviceDate: "2026-08-04",
  merchant: "Pret a Manger",
  location: "London Bridge",
  businessReason: "Authorised duty in London",
  receiptTotalPence: 1_250,
  eligiblePence: 1_250,
  gratuityPence: 0,
  category: "food",
  mealContext: "lunch",
  tripId: null,
  hasReceipt: true,
  claimablePence: 1_250,
  capLimited: false,
  ...overrides,
});

function testPng(width = 1, height = 2): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function testJpeg(width = 1, height = 2): Uint8Array {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8]);
  bytes[7] = height >> 8;
  bytes[8] = height & 0xff;
  bytes[9] = width >> 8;
  bytes[10] = width & 0xff;
  return bytes;
}

describe("audit range validation", () => {
  it("accepts an ordered range and rejects a reversed one", () => {
    assert.equal(auditRangeIssue("2026-08-01", "2026-08-31"), null);
    assert.match(
      auditRangeIssue("2026-08-31", "2026-08-01") ?? "",
      /must not be before/,
    );
  });

  it("rejects impossible dates and oversized ranges", () => {
    assert.match(
      auditRangeIssue("2026-02-30", "2026-03-01") ?? "",
      /real date/,
    );
    assert.match(
      auditRangeIssue("2026-01-01", "2026-12-31") ?? "",
      /up to 92 days/,
    );
  });
});

describe("deterministic audit findings", () => {
  it("asks for justification when evidence or context is missing", () => {
    const { questions } = ruleFindings(
      [
        auditExpense("a", { hasReceipt: false }),
        auditExpense("b", { location: null }),
        auditExpense("c", { capLimited: true }),
      ],
      calculation(),
    );
    const ids = questions.map((question) => question.id);
    assert.ok(ids.includes("rule-receipt-a"));
    assert.ok(ids.includes("rule-location-b"));
    assert.ok(ids.includes("rule-cap-c"));
  });

  it("flags repeated merchant, date and amount as a possible duplicate", () => {
    const { questions } = ruleFindings(
      [auditExpense("a"), auditExpense("b")],
      calculation(),
    );
    assert.ok(questions.some((question) => question.id === "rule-duplicate-b"));
  });

  it("records travel at actuals as an observation, not a question", () => {
    const { questions, observations } = ruleFindings(
      [auditExpense("cab", { category: "taxi", claimablePence: 4_200, eligiblePence: 4_200, receiptTotalPence: 4_200 })],
      calculation(),
    );
    assert.equal(
      questions.filter((question) => question.expenseId === "cab").length,
      0,
    );
    assert.ok(
      observations.some((observation) =>
        observation.topic.includes("Travel claimed at actuals"),
      ),
    );
  });
});

describe("Word report generation", () => {
  it("escapes XML-significant characters", () => {
    assert.equal(escapeXml('<w:evil> & "quotes"'), "&lt;w:evil&gt; &amp; &quot;quotes&quot;");
  });

  it("builds a valid store-only docx package", () => {
    const bytes = buildDocx({
      title: "Test",
      author: "owner@example.com",
      createdAt: new Date("2026-08-01T12:00:00Z"),
      blocks: [{ kind: "title", text: "Hello report" }],
    });
    const text = new TextDecoder("latin1").decode(bytes);
    assert.equal(text.slice(0, 2), "PK");
    assert.ok(text.includes("[Content_Types].xml"));
    assert.ok(text.includes("word/document.xml"));
    assert.ok(text.includes("Hello report"));
  });

  it("embeds answers and escapes hostile ledger text", () => {
    const bytes = composeAuditDocx({
      ownerEmail: "owner@example.com",
      range: { startDate: "2026-08-01", endDate: "2026-08-31" },
      expenses: [
        auditExpense("a", { merchant: 'Caffè <script>alert("x")</script>' }),
      ],
      claims: [{ period: "2026-08", status: "prepared", claimablePence: 3_000 }],
      calculation: calculation(),
      policyVersion: "JSP-752-v66.1",
      observations: [{ topic: "Note", detail: "An observation." }],
      questions: [
        {
          id: "rule-receipt-a",
          source: "rule",
          expenseId: "a",
          topic: "Missing receipt evidence",
          detail: "Detail text.",
          question: "Where is the receipt?",
        },
        {
          id: "ai-1",
          source: "ai",
          expenseId: null,
          topic: "Weekend claim",
          detail: "Saturday spend.",
          question: "Was this duty travel?",
        },
      ],
      answers: { "rule-receipt-a": "The paper original is filed with the unit HR office." },
      ai: { used: true, model: "gpt-5.6-sol", summary: "Ledger looks broadly consistent." },
      createdAt: new Date("2026-09-01T09:00:00Z"),
      evidence: [
        {
          expenseId: "a",
          status: "embedded",
          detail: "Embedded from the secure JPEG/PNG analysis copy.",
          image: {
            bytes: testPng(),
            contentType: "image/png",
            widthPx: 1,
            heightPx: 2,
            source: "analysis",
          },
        },
      ],
    });
    const text = new TextDecoder("latin1").decode(bytes);
    assert.ok(text.includes("The paper original is filed with the unit HR office."));
    assert.ok(text.includes("No justification provided yet."));
    assert.ok(text.includes("&lt;script&gt;"));
    assert.ok(!text.includes("<script>"));
    assert.ok(text.includes("Ledger looks broadly consistent."));
    assert.ok(text.includes("Receipt evidence appendix"));
    assert.ok(text.includes("word/media/receipt-1.png"));
    assert.ok(text.includes('Target="media/receipt-1.png"'));
    assert.ok(text.includes('r:embed="rIdImage1"'));
    assert.ok(text.includes('cx="9525" cy="19050"'));
  });

  it("states why unsupported receipt evidence is not embedded", () => {
    const bytes = composeAuditDocx({
      ownerEmail: "owner@example.com",
      range: { startDate: "2026-08-01", endDate: "2026-08-31" },
      expenses: [auditExpense("heic")],
      claims: [],
      calculation: calculation(),
      policyVersion: "JSP-752-v66.1",
      observations: [],
      questions: [],
      answers: {},
      ai: { used: false, model: "", summary: "" },
      createdAt: new Date("2026-09-01T09:00:00Z"),
      evidence: [
        {
          expenseId: "heic",
          status: "heic",
          detail:
            "The original is HEIC/HEIF and no JPEG or PNG analysis copy is available.",
        },
      ],
    });
    const text = new TextDecoder("latin1").decode(bytes);
    assert.ok(text.includes("Image not embedded"));
    assert.ok(text.includes("HEIC/HEIF"));
    assert.ok(!text.includes("word/media/receipt-1"));
  });

  it("labels a HEIC browser derivative as non-authoritative while registering the original hash", () => {
    const originalHash = "a".repeat(64);
    const bytes = composeAuditDocx({
      ownerEmail: "owner@example.com",
      range: { startDate: "2026-08-01", endDate: "2026-08-31" },
      expenses: [auditExpense("heic-preview")],
      claims: [],
      calculation: calculation(),
      policyVersion: "JSP-752-v66.1",
      observations: [],
      questions: [],
      answers: {},
      ai: { used: false, model: "", summary: "" },
      createdAt: new Date("2026-09-01T09:00:00Z"),
      evidence: [
        {
          expenseId: "heic-preview",
          status: "embedded",
          detail:
            `Immutable original: image/heic, 1234 bytes, SHA-256 ${originalHash}. ` +
            "The embedded JPEG is an owner-supplied browser-created preview, linked to that SHA-256 in secure storage metadata; it is non-authoritative and is not the immutable original.",
          original: {
            contentType: "image/heic",
            byteSize: 1234,
            sha256: originalHash,
          },
          image: {
            bytes: testJpeg(),
            contentType: "image/jpeg",
            widthPx: 1,
            heightPx: 2,
            source: "owner_preview",
          },
        },
      ],
    });
    const text = new TextDecoder("latin1").decode(bytes);
    assert.ok(text.includes("Immutable original"));
    assert.ok(text.includes(`SHA-256 ${originalHash}`));
    assert.ok(text.includes("Owner-supplied browser-created JPEG preview"));
    assert.ok(text.includes("non-authoritative; not the immutable original"));
    assert.ok(text.includes("word/media/receipt-1.jpg"));
  });
});
