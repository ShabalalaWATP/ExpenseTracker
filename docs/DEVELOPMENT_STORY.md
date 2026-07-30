# Development Story

This document records meaningful implementation milestones, decisions and verification work for future maintainers. Entries are chronological and focus on why each change matters.

## 28 July 2026

- Established ExpenseTracker as a private OpenAI Sites application using Vinext, keeping access and personal expense evidence within the intended private site boundary.
- Built an iPhone-first responsive interface for capturing receipts, reviewing daily allowance, managing trips and expenses, preparing claims, and inspecting settings. Desktop layouts remain supported without displacing the mobile workflow.
- Added Cloudflare D1 persistence for trips, expenses and prepared claims, with R2 storage for receipt evidence. Receipt responses are explicitly private and non-cacheable.
- Implemented UK Day Subsistence calculations for JSP 752 v66.1. The policy applies a £30 daily cap, claims qualifying actual spend including permitted gratuities and service charges, requires receipt and eligibility evidence, and permits aggregation only for trips of at least two nights.
- Added the ExpenseTracker logo, application icons and branded Open Graph image so installed and shared representations use the same visual identity as the product.
- Added focused policy tests covering daily caps, aggregation eligibility, evidence requirements, gratuities and jurisdiction, plus rendered-output checks for worker routes, migrations, private-ready configuration and branded assets.
- Completed independent quality and security reviews. The resulting hardening added standalone daily claims, prepared-period evidence locks, cross-period aggregate review, repeatable receipt-upload idempotency, server-derived Today figures, blank-MIME iPhone upload support and anti-framing response headers.
- Upgraded the React, Next.js and Sites build dependencies, applied safe transitive updates and confirmed that the production dependency audit reports no known vulnerabilities.
- Verified the Vinext production build and automated tests, then completed a local HTTP smoke check of the application. No production deployment was performed at this milestone.
- Created the ExpenseTracker Sites project, saved version 1 from commit `299c708`, and deployed it successfully to production with a custom owner-only policy. An unauthenticated request received `401`, confirming that the private gateway denies direct public access.
- Added a mobile receipt inbox that accepts up to 20 camera or Photo Library
  images and processes two at a time. Originals are secured before any
  extraction, and a normalised JPEG derivative is used for AI review.
- Added structured receipt extraction using the current OpenAI receipt model,
  with uncertainty, line-item and suspected-alcohol review. AI suggestions
  remain separate from the deterministic JSP 752 calculation and require owner
  confirmation before an expense is created.
- Added opt-in Realtime voice clarification for unresolved questions. The
  standard API key remains server-side, and Safari receives only a short-lived
  client credential after an explicit microphone action.
- Enforced the Sites identity against a single configured owner on every API,
  owner-scoped all database and receipt-object access, and recorded safe audit
  events for financial mutations.
- Added protected JSON and CSV exports, Sites runtime model configuration,
  graceful manual operation without an OpenAI key, and focused extraction tests.

## 29 July 2026

- Reframed the application around receipt capture and review. Capture is now
  the opening view, operational receipt language replaces prominent policy
  messaging, and the policy reference remains available in a collapsed
  Settings disclosure.
- Added Calendar as a first-class desktop and mobile destination. It supports
  working-week, week and month views, daily claim totals, selected-day receipt
  review, direct evidence links and date-led receipt capture.
- Added a persistent current-view header, stronger selected navigation states
  and an explicit mobile Settings label so users can always identify their
  location in the app.
- Reworked dark mode to near-black and navy surfaces with a separate
  accessible blue action token, and refreshed the social preview in the same
  receipt-first visual direction.
- Preserved a date selected in Calendar through manual and batch capture,
  while validating the date at the server boundary and retaining a
  model-extracted date only when no explicit capture date exists.
- Corrected the Realtime WebRTC call to the documented endpoint and replaced a
  generic AI-ready status with configuration-specific wording. Receipt
  extraction and voice are wired to the configured current models, but a real
  receipt and iPhone Safari microphone test remain required before claiming
  full end-to-end acceptance.
- Completed TypeScript, ESLint and the complete 19-test build suite after the
  calendar, navigation, capture and AI-path changes.
- Pushed the exact verified source only to the private Sites repository, saved
  an immutable release and deployed it successfully through the verified
  owner-only production path. Owner-side smoke checks confirmed Capture,
  Calendar, date-led capture, Settings, AI configuration status and the
  near-black dark theme.
- Diagnosed the first receipt-reading failures as a quality configuration
  problem: production used the high-volume Luna model, disabled reasoning,
  reduced iPhone images to 2,400 pixels and requested model-side high rather
  than original image detail.
- Upgraded receipt extraction to the frontier `gpt-5.6-sol` model with original
  image detail, high reasoning effort, a larger response budget and explicit
  line-item, total, discount, service-charge, eligibility and alcohol
  reconciliation instructions. Safari now retains up to 4,096 pixels in the
  bounded metadata-stripped analysis copy.
- Added owner-scoped re-analysis of existing unconfirmed receipts from their
  private R2 analysis copy. This lets the first Luna-read receipts be re-read
  with Sol after a reload without creating a duplicate upload.
- Made dark mode the pre-paint default on devices with no saved preference,
  while preserving explicitly selected Light, Dark and System modes. Updated
  the installed-app colours to the same near-black navy.
- Added a visible Close settings action that returns to the preceding app view
  with Capture as the safe fallback for a direct Settings link.
- Live owner-side testing caught and fixed the root-history edge case where
  closing Settings changed the URL but left the Settings view rendered.
- Audited the capture, correction, claim and recovery paths against measurable
  definition-of-done goals. The release remains a provisional beta until route
  integration, real iPhone, extraction-accuracy and recovery gates are proven.
- Corrected two policy defects against official JSP 752 v66.1: gratuities and
  service charges now remain claimable within the allowance, and standalone or
  overlapping non-aggregate records can no longer multiply the £30 cap for one
  date.
- Kept the receipt image visible during narrow-screen review, exposed required
  where-and-why context before batch capture, removed confirmed receipts from
  the operational inbox and blocked claim preparation while a relevant receipt
  remains unconfirmed.
- Completed expense correction for service charge or tip, meal context and trip
  linkage. Replaced destructive expense deletion with owner-scoped soft delete,
  Recently deleted and restore while retaining D1 metadata and private R2
  evidence.
- Added an August submission pack with copy-ready descriptions and private
  receipt View and Download actions. Added the additive `deleted_at` migration,
  migration preservation checks and claim-handoff regression tests.
- Verified the improvement source with TypeScript, ESLint, the production Sites
  build, all 32 automated tests, migration preservation and a production
  dependency audit reporting zero known vulnerabilities.
- Added a database-enforced claim-period lock acquired before snapshot figures
  are read. D1 triggers now reject any racing expense, receipt, receipt-intake
  or trip mutation, and a timed recovery path clears an abandoned preparation
  lock when no snapshot was created.
- Separated the complete claim-readiness query from the paginated receipt inbox,
  blocked attachments to deleted expenses and made soft-delete/restore audit
  events conditional on a real state transition.
- Reordered staged-receipt deletion so the trigger-protected D1 transition must
  succeed before R2 cleanup. A regression proves a claim-lock rejection
  preserves both the intake row and every receipt object.
- Implemented the 0.2.0 evidence-assurance release: adjustable receipt analysis
  images, selected-field Sol re-checks, preserved owner corrections, correction
  provenance, append-only receipt revisions, possible-duplicate review and
  deterministic line-item reconciliation.
- Added an IndexedDB upload queue that reuses the same idempotency key after an
  interruption and resumes when the app is visible and online. Added a minimal
  service worker that caches only public shell assets and never caches private
  pages, APIs, receipts or ledger responses.
- Extended Calendar with receipt-attention filters, a selected-day evidence
  drawer and duty-date range selection that opens a pre-filled Trip form.
  Readiness actions now deep-link to the exact intake, expense or trip.
- Added a frozen-claim submission ZIP containing a PDF, formula-safe CSV,
  manifest and checksum-verified original receipts.
- Added a portable owner-only recovery ZIP, R2/D1 evidence-integrity check,
  local queue controls, current model status, last successful extraction,
  database/storage health, app version and storage usage in Settings.
- Hardened the release after independent quality and security reviews:
  serialised IndexedDB queue updates, guarded concurrent manual and AI writes,
  deterministic archive manifests, 99-ID D1 query chunks, size-bounded
  multipart claim and recovery archives, and byte-for-byte evidence
  verification.
- Closed the final concurrency findings with an atomic claim-lock acquisition
  that cannot overtake an active receipt mutation, plus a versioned delete that
  cannot remove receipt evidence after confirmation starts. SQLite regressions
  exercise both losing race orders against the real migration triggers.
- Generated additive migration `0004_woozy_gravity.sql`. TypeScript, ESLint,
  production build, migration rehearsal and all 45 TypeScript tests plus five
  rendered/migration checks passed. The production dependency audit reported
  zero known vulnerabilities.
- Refreshed the UI while keeping the ink-and-paper ledger identity. Replaced
  the glyph-character navigation with a shared stroke-icon set (new
  `app/components/icons.tsx`, no runtime dependency), self-hosted the Fraunces
  variable font for display type with a Georgia fallback, and introduced
  radius tokens, button press states and a dot-grid rail texture. Rebuilt the
  Today view around a raised spotlight summary card: an animated count-up of
  the claimable total, a rounded cap meter with an over-cap state, and a
  hand-rolled seven-day eligible-spend bar chart with theme-specific,
  colour-vision-checked bar colours and a table fallback. Attention items now
  map category and severity to icon chips and deep-link to their targets, and
  recent entries open the expense editor directly. Added Overview to the
  desktop navigation, pointed the brand button at it, and removed the
  redundant sticky context bar. All animation respects reduced-motion. No new
  packages were added.
- Extended the ledger beyond food with expense categories (food, taxi, public
  transport, parking, other) via additive migration `0005_rapid_slapstick.sql`
  on both `expenses` and `receipt_intakes`. Only food consumes the £30 JSP 752
  daily allowance: travel and parking are claimed at actuals through a
  cap-exempt allocation path, travel-only days no longer create an allowance,
  and the Today cap meter and seven-day chart are food-scoped. The AI
  extraction schema, prompt, owner-wins merge, provenance, targeted rechecks,
  voice clarifications and correction history all carry the new field, and it
  appears in capture defaults, intake review, manual entry, the expense
  editor, list subtitles, claim package CSV and PDF summary, and both privacy
  exports (schema version 3). Three new domain tests pin the cap-exemption
  behaviour and the migration rehearsal now applies 0005.
- Added an owner-triggered audit response workflow. The claimant picks the
  audited date range on the Claims view; the server combines deterministic
  JSP 752 checks (missing receipts, missing context, over-cap days, possible
  duplicates, unclassified categories) with an AI ledger review that raises
  auditor-style questions, then composes a Microsoft Word report from a new
  dependency-free OOXML writer built on the existing store-only ZIP builder.
  The report contains scope and method, financial and category summaries, the
  expense ledger, every finding with the claimant's typed justification, an
  evidence register and a declaration. The flow degrades to rule-based checks
  when AI is unavailable, bounds all input, escapes XML against hostile
  merchant text, and records an audit event per generated report. Eight new
  tests cover range validation, the deterministic findings and the generated
  package.
