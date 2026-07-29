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
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(analysisLock, /status IN \('uploaded', 'needs_review', 'ready', 'failed'\)/);
  assert.doesNotMatch(analysisLock, /status <> 'analysing'/);
  assert.match(intakeModel, /hasAnalysisCopy: Boolean\(row\.analysis_object_key\)/);
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, "RECEIPTS");
  assert.match(hostingConfig.project_id, /^appgprj_/);
});
