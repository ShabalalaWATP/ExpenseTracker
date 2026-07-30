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
- Reads multilingual and foreign-currency receipts, preserves the original
  evidence, produces an English translation, and freezes the dated conversion
  used by the GBP claim ledger.
- Records the merchant, date, location, business reason and eligible amount.
- Stores expense and trip records in D1 and receipt images in private R2.
- Applies a £30 allowance for each confirmed eligible day.
- Supports JSP 752 aggregation for trips of at least two nights.
- Supports multi-country trips as ordered itinerary legs, including
  country-aware automatic receipt linking and multi-stop OpenAI Realtime
  speech-to-speech entry. The main Create a trip action opens with a natural
  invitation to describe the trip, actively gathers any missing details and
  creates the record after the final readback when the user says they are
  happy. Type instead opens the complete manual form.
- Includes permitted gratuities and service charges within the £30 limit.
- Keeps deletions recoverable without removing private receipt evidence.
- Provides copy-ready where-and-why text and receipt downloads for submission.
- Adjusts crop, rotation and contrast before a frontier-model re-read without
  changing the secured original.
- Requires explicit review of possible duplicates and receipt arithmetic.
- Preserves interrupted iPhone uploads on-device and resumes them when the app
  is open and online.
- Provides working-week, week and month calendars with day evidence and
  calendar-led trip creation.
- Breaks food statistics into controlled, AI-derived styles using the merchant,
  venue type and receipt items together, with deterministic classification for
  recognised merchants in older receipt records.
- Filters every statistic, chart and map by week, calendar month, a
  three-calendar-month window or calendar year, with like-for-like comparison
  against the immediately preceding period.
- Keeps the five frequent mobile actions spacious in the bottom navigation,
  with Statistics, Audit response and Settings grouped under More.
- Prepares an immutable August claim snapshot and records submission status.
- Downloads complete, size-bounded claim ZIP parts with PDF, CSV, manifest and
  original receipts.
- Provides protected JSON, CSV and size-bounded multipart recovery ZIP exports,
  byte-level integrity checks and an append-only correction and audit history.

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
- Leaflet for broadly compatible interactive expense-location maps, with
  selectable CARTO dark and detailed basemaps plus a classic OpenStreetMap
  layer

Original receipt money is stored as an integer in the currency's declared minor
unit. The JSP 752 ledger remains integer GBP pence. Foreign conversions use an
immutable, owner-scoped ECB reference-rate quote and exact rational arithmetic,
never a model-calculated rate. The original value, translation, quote date,
source and rounded GBP result remain together in exports and audit evidence.
If the AI cannot identify an origin code, the exception screen permits a
bounded owner correction and retries conversion. If the ECB has no rate for a
supported currency, an explicitly acknowledged owner-supplied GBP equivalent
is retained as owner evidence rather than being presented as an official rate.

Mutation routes require same-origin requests, every route validates the private
owner, receipt uploads are bounded and signature-checked, and API responses use
`no-store`. The permanent OpenAI API key is used only by server routes. Safari
voice sessions receive a short-lived Realtime client secret.

Statistics are calculated locally in the signed-in browser from the
owner-scoped dashboard response. Chart selections open the existing private
expense editor rather than creating a second copy of claim data. Confirmed
food receipts retain up to three controlled semantic food-style tags. Week
means Monday to Sunday, the three-month option ends in the selected calendar
month, and Annual means the selected calendar year. Every range is compared
with the immediately preceding range of equal length. The Statistics view
combines semantic tags with deterministic merchant and line-item signals so
known historic receipts do not remain under a generic category.
Receipt extractions can retain AI-estimated coordinates only when the receipt
contains supporting branch or address evidence. Older records use visibly
labelled city or country-centre fallbacks. Statistics defaults to CARTO Dark
Matter in dark mode and CARTO Voyager in light mode, with classic
OpenStreetMap available from the map's layer control. The selected provider
receives normal map-tile requests for the visible area, but no merchant names,
claim descriptions or receipt images. The selected layer is a device-local
preference. The map uses DOM and SVG rendering rather than WebGL, and its dots
remain interactive against a local grid if the external street background is
unavailable.

The Expenses view is the editable receipt ledger. Submit is deliberately
separate: it scopes the ledger to one month, shows the amount ready to claim
and any missing evidence, locks the completed period, and creates the
downloadable claim package.

The international evidence and itinerary design is recorded in
[`docs/adr/0001-international-receipts-and-multi-country-trips.md`](docs/adr/0001-international-receipts-and-multi-country-trips.md).

## Deployment

Sites is the production host. Deployment uses the project identifier in
`.openai/hosting.json`, saves an immutable version from an exact Git commit and
publishes it with owner-only private access.

The GitHub repository currently configured as `origin` is public. Do not push
private application work or receipt data there unless its visibility has first
been changed and reviewed.
