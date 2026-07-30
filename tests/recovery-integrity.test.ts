import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evidenceIntegrityHealthy,
// @ts-expect-error Node's TypeScript stripping requires the source extension.
} from "../src/server/recovery-integrity.ts";

describe("recovery integrity health", () => {
  it("is unhealthy when an untracked receipt object exists", () => {
    assert.equal(
      evidenceIntegrityHealthy({
        missing: [],
        sizeMismatches: [],
        hashMismatches: [],
        orphanedObjects: ["receipt-intakes/owner-1/orphan.jpg"],
      }),
      false,
    );
  });

  it("is healthy only when every integrity issue collection is empty", () => {
    assert.equal(
      evidenceIntegrityHealthy({
        missing: [],
        sizeMismatches: [],
        hashMismatches: [],
        orphanedObjects: [],
      }),
      true,
    );
  });
});
