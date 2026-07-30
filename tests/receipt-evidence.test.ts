import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
// @ts-expect-error Node's TypeScript stripping requires the source extension.
import { directReceiptPreviewObjectKey, receiptEvidenceUrls, selectExpenseReceiptSource } from "../src/domain/receipt-evidence.ts";

describe("receipt evidence links", () => {
  it("uses the owner-scoped expense endpoint and requests the original explicitly", () => {
    assert.deepEqual(
      receiptEvidenceUrls({ id: "expense 1" }),
      {
        preview: "/api/expenses/expense%201/receipt",
        download: "/api/expenses/expense%201/receipt?download=1",
      },
    );
  });

  it("does not trust a legacy receipt URL that bypasses HEIC preview handling", () => {
    assert.deepEqual(
      receiptEvidenceUrls({
        id: "expense-1",
        receiptUrl: "/api/receipts/legacy-receipt",
      }),
      {
        preview: "/api/expenses/expense-1/receipt",
        download: "/api/expenses/expense-1/receipt?download=1",
      },
    );
  });
});

describe("receipt preview selection", () => {
  const receipt = {
    objectKey: "receipt-intakes/owner/intake/original.heic",
    contentType: "image/heic",
    analysisObjectKey: "receipt-intakes/owner/intake/analysis-1.jpg",
  };

  it("uses a browser-compatible analysis copy for an inline HEIC preview", () => {
    assert.deepEqual(selectExpenseReceiptSource(receipt, false), {
      objectKey: receipt.analysisObjectKey,
      contentType: "image/jpeg",
      original: false,
    });
  });

  it("always selects the immutable original for downloads", () => {
    assert.deepEqual(selectExpenseReceiptSource(receipt, true), {
      objectKey: receipt.objectKey,
      contentType: "image/heic",
      original: true,
    });
  });

  it("uses a deterministic owner-scoped key for direct attachment previews", () => {
    assert.equal(
      directReceiptPreviewObjectKey("owner-1", "receipt-1"),
      "receipt-previews/owner-1/receipt-1.jpg",
    );
  });

  it("uses JPEG and PNG originals directly", () => {
    assert.deepEqual(
      selectExpenseReceiptSource(
        {
          objectKey: "receipts/owner/original.png",
          contentType: "image/png",
          analysisObjectKey: "receipt-intakes/owner/intake/analysis.jpg",
        },
        false,
      ),
      {
        objectKey: "receipts/owner/original.png",
        contentType: "image/png",
        original: true,
      },
    );
  });
});

describe("receipt evidence endpoint", () => {
  it("requires the owner and serves private no-store evidence", async () => {
    const [route, repository] = await Promise.all([
      readFile(
        new URL(
          "../app/api/expenses/[id]/receipt/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/server/receipt-repository.ts", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(route, /requirePrincipal\(\)/);
    assert.match(route, /searchParams\.get\("download"\) === "1"/);
    assert.match(route, /private, no-store, max-age=0/);
    assert.match(route, /Cross-Origin-Resource-Policy": "same-origin"/);
    assert.match(repository, /WHERE r\.owner_id = \? AND r\.expense_id = \?/);
    assert.match(repository, /i\.owner_id = r\.owner_id/);
    assert.match(repository, /directReceiptPreviewObjectKey/);
    assert.match(repository, /loadVerifiedReceiptPreview/);
  });

  it("stores direct HEIC previews through a bounded owner-scoped route", async () => {
    const [route, preview] = await Promise.all([
      readFile(
        new URL(
          "../app/api/expenses/[id]/receipt/preview/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../src/server/receipt-preview.ts", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(route, /requireSameOrigin\(request\)/);
    assert.match(route, /requirePrincipal\(\)/);
    assert.match(route, /readBoundedBody\(request, MAX_RECEIPT_PREVIEW_BYTES\)/);
    assert.match(preview, /WHERE r\.owner_id = \? AND r\.expense_id = \?/);
    assert.match(preview, /assertDateUnlocked/);
    assert.match(preview, /imageDimensions/);
    assert.match(preview, /customMetadata: \{\s*sha256: hash/);
    assert.match(preview, /previewProvenance: "owner-supplied-browser-preview"/);
    assert.match(preview, /sourceReceiptId: row\.id/);
    assert.match(preview, /sourceReceiptSha256: row\.sha256\.toLowerCase\(\)/);
  });
});

describe("receipt evidence navigation", () => {
  it("opens claim evidence in the expense editor and returns to Expenses", async () => {
    const [claimPanel, expenseApp] = await Promise.all([
      readFile(
        new URL("../app/components/ClaimSubmissionPanel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/ExpenseApp.tsx", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(
      claimPanel,
      /navigateTarget\(\{\s*view: "expenses",\s*expenseId: expense\.id,/,
    );
    assert.match(claimPanel, /href=\{evidenceUrls\.download\}/);
    assert.match(expenseApp, /const next = \{ view: target\.view \}/);
  });
});
