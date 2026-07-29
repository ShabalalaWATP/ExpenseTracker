import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the ExpenseTracker worker and branded client assets", async () => {
  const [serverBundle, manifest, clientFiles] = await Promise.all([
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/client/.vite/manifest.json", import.meta.url),
      "utf8",
    ),
    readdir(new URL("../dist/client/", import.meta.url)),
  ]);

  assert.match(serverBundle, /ExpenseTracker/);
  assert.match(serverBundle, /\/api\/dashboard/);
  assert.match(serverBundle, /\/api\/receipt-intakes/);
  assert.match(serverBundle, /gpt-realtime-2\.1/);
  assert.match(serverBundle, /gpt-5\.6-sol/);
  assert.match(manifest, /ExpenseApp/);
  assert.ok(clientFiles.includes("expensetracker-logo.png"));
  assert.ok(clientFiles.includes("og.png"));
  await access(
    new URL(
      "../dist/.openai/drizzle/0000_clear_big_bertha.sql",
      import.meta.url,
    ),
  );
  await access(
    new URL(
      "../dist/.openai/drizzle/0002_dapper_speedball.sql",
      import.meta.url,
    ),
  );
  await access(
    new URL(
      "../dist/.openai/drizzle/0003_neat_runaways.sql",
      import.meta.url,
    ),
  );
  await access(
    new URL(
      "../dist/.openai/drizzle/0001_good_zzzax.sql",
      import.meta.url,
    ),
  );
});

test("keeps the site private-ready and free of starter scaffolding", async () => {
  const [layout, page, packageJson, hosting, analysisLock, intakeModel, app] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(
      new URL("../src/server/receipt-intake-analysis.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/server/receipt-intake-model.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/components/ExpenseApp.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /lang="en-GB"/);
  assert.match(layout, /\/og-v2\.png/);
  assert.match(layout, /dataset\.theme = "dark"/);
  assert.match(page, /<ExpenseApp \/>/);
  assert.match(app, /function closeSettings\(\)/);
  assert.match(app, /viewNames\.has\(hash\) \? hash : "capture"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(analysisLock, /status IN \('uploaded', 'needs_review', 'ready', 'failed'\)/);
  assert.doesNotMatch(analysisLock, /status <> 'analysing'/);
  assert.match(intakeModel, /hasAnalysisCopy: Boolean\(row\.analysis_object_key\)/);
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, "RECEIPTS");
  assert.match(hostingConfig.project_id, /^appgprj_/);
});

test("packages recoverable evidence and an operational receipt inbox", async () => {
  const [
    expenseRepository,
    deleteRoute,
    restoreRoute,
    intakeRepository,
    dashboard,
    intakeStyles,
    receiptRoute,
    runtimeConfig,
    exportService,
    claimRoute,
    claimLockSchema,
  ] = await Promise.all([
    readFile(new URL("../src/server/expense-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/expenses/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/expenses/[id]/restore/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/receipt-intake-repository.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/dashboard.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/styles/intake.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/receipts/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/runtime-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/export-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/claims/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/server/claim-lock-schema.ts", import.meta.url), "utf8"),
  ]);

  assert.match(expenseRepository, /SET deleted_at = strftime/);
  assert.match(expenseRepository, /SET deleted_at = NULL/);
  assert.doesNotMatch(expenseRepository, /DELETE FROM expenses/);
  assert.doesNotMatch(deleteRoute, /removeReceiptObjects/);
  assert.match(restoreRoute, /requireSameOrigin\(request\)/);
  assert.match(restoreRoute, /requirePrincipal\(\)/);
  assert.match(intakeRepository, /status <> 'confirmed'/);
  assert.match(dashboard, /receipt_intake_pending/);
  assert.doesNotMatch(intakeStyles, /\.review-receipt\s*\{\s*display:\s*none/);
  assert.match(receiptRoute, /searchParams\.get\("download"\) === "1"/);
  assert.doesNotMatch(runtimeConfig, /OPENAI_CHAT_MODEL/);
  assert.match(exportService, /e\.deleted_at/);
  assert.match(exportService, /"deleted_at"/);
  assert.match(claimRoute, /acquireClaimPeriodLock/);
  assert.match(claimRoute, /finaliseClaimPeriodLock/);
  assert.match(claimLockSchema, /RAISE\(ABORT, 'claim_period_locked'\)/);
});
