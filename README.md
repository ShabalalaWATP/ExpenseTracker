# ExpenseTracker

ExpenseTracker is a private, mobile-first web app for recording August 2026
food and non-alcoholic drink expenses and preparing a JSP 752 claim. It is
designed for Safari on iPhone 16 and deployed through OpenAI Sites.

## What it does

- Captures a receipt photo directly from an iPhone camera or photo library.
- Accepts up to 20 receipt photos in one review queue, with two uploads active
  at a time for reliable mobile use.
- Suggests receipt fields with OpenAI vision and offers voice clarification only
  when a required detail is unresolved.
- Records the merchant, date, location, business reason and eligible amount.
- Stores expense and trip records in D1 and receipt images in private R2.
- Applies a £30 allowance for each confirmed eligible day.
- Supports JSP 752 aggregation for trips of at least two nights.
- Excludes separately identified gratuities from the claimable amount.
- Prepares an immutable August claim snapshot and records submission status.
- Provides protected JSON and CSV exports plus a minimal audit history.

The app assists with claim preparation. The user remains responsible for
confirming eligibility and the applicable policy with their authorising team.

## Local development

Requirements:

- Node.js 22.13 or later
- npm

```bash
npm ci
npm run dev
```

Vinext creates local D1 and R2 resources from
`.openai/hosting.json`. No production receipt data is required locally.

For local AI testing, copy the variable names from `.env.example` into an
ignored `.dev.vars` file. Add your own `EXPENSETRACKER_OWNER_EMAIL` and
`OPENAI_API_KEY` values there. Never commit `.dev.vars`, paste the key into
browser code, or prefix it with `NEXT_PUBLIC_`.

In production, add the same two values to the Sites project runtime
environment. `OPENAI_API_KEY` must be marked secret. The model variables are
non-secret and may retain their checked-in defaults.

## Verification

```bash
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test tests/jsp752.test.ts
npm test
npm audit --omit=dev
```

`npm test` performs a production Sites build and checks the generated worker,
client assets and migration package.

## Architecture

- Vinext, React and TypeScript
- Cloudflare Worker-compatible API routes
- D1 for structured claim data
- R2 for private receipt objects
- Drizzle schema and generated migrations

All money is stored as integer pence. Mutation routes require same-origin
requests, every route validates the private owner, receipt uploads are bounded
and signature-checked, and API responses use `no-store`. The permanent OpenAI
API key is used only by server routes. Safari voice sessions receive a
short-lived Realtime client secret.

## Deployment

Sites is the production host. Deployment uses the project identifier in
`.openai/hosting.json`, saves an immutable version from an exact Git commit and
publishes it with owner-only private access.

The GitHub repository currently configured as `origin` is public. Do not push
private application work or receipt data there unless its visibility has first
been changed and reviewed.
