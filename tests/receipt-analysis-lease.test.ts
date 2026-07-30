import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("receipt analysis lease", () => {
  it("stores the operation token and object key in the analysis lock", async () => {
    const text = await source("../src/server/receipt-intake-analysis.ts");
    assert.match(text, /analysis_object_key = \?/);
    assert.match(text, /analysis_token = \?/);
    assert.match(text, /analysis_lease_expires_at/);
    assert.ok(
      text.indexOf("analysis_object_key = ?") <
        text.indexOf("getReceiptsBucket().put(objectKey"),
      "the discoverable D1 lease must exist before the R2 write starts",
    );
    assert.match(text, /receipt_analysis_superseded/);
  });

  it("accepts a late result only for the current analysing token", async () => {
    const text = await source("../src/server/receipt-analysis-persistence.ts");
    assert.match(
      text,
      /WHERE owner_id = \? AND id = \? AND status = 'analysing'\s+AND analysis_token = \?/,
    );
    assert.match(text, /receiptRevisionStatementAfterChange/);
    assert.match(text, /auditStatementAfterChange/);
    assert.match(text, /receipt_analysis_superseded/);
  });

  it("invalidates an expired token before allowing removal", async () => {
    const text = await source("../src/server/receipt-analysis-lease.ts");
    assert.match(text, /analysis_token = NULL/);
    assert.match(text, /analysis_lease_expires_at <=/);
    assert.match(text, /WHERE owner_id = \? AND id = \?/);
  });
});
