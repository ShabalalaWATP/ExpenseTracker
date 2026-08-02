# ExpenseTracker Master Implementation Plan

Status: Private provisional beta, real-device and recovery acceptance pending
Deployment: Private Sites production, with immutable release history in Sites
Primary client: iPhone 16 using Safari
Initial claim period: August 2026
Source repository: `ShabalalaWATP/ExpenseTracker`
Policy baseline: JSP 752 v66.1, May 2026
Last updated: 30 July 2026

## 1. Vision and current position

ExpenseTracker is a private, mobile-first evidence and expense-claim aid for one
owner. Its first purpose is to support an August 2026 UK Day Subsistence claim:
capture a receipt, confirm the eligible amount and duty context, calculate the
claim under JSP 752, and freeze a reviewed monthly snapshot.

The private beta now includes resilient receipt capture, receipt-image
adjustment, targeted AI re-checks, deterministic duplicate and arithmetic
review, a correction trail, calendar-led trip creation, structured readiness,
immutable submission packages, portable recovery packages and operational
health checks.

The application is privately deployed. The owner-only Sites boundary and
unauthenticated denial have been verified. International receipt evidence,
deterministic GBP conversion and multi-country itinerary support are complete
in code. Real iPhone HEIC capture, multilingual receipt acceptance and the
recovery position remain manual follow-up items before the app is treated as a
formal system of record.

ExpenseTracker is not a budgeting product, accounting system, entitlement
decision-maker, employer approval workflow, payment service or public SaaS
product.

## 2. Preserved product and architecture decisions

### Product boundary

- One owner only, with no public registration, invitations or organisations.
- The policy ledger remains GBP and UK JSP 752. Receipts may originate in other
  countries and currencies, with their original evidence preserved beside a
  frozen GBP policy value.
- August 2026 remains the initial snapshot period. Claims metrics can be viewed
  for a selected calendar month.
- Online-first processing with a private on-device IndexedDB queue for
  interrupted receipt uploads. The same idempotency key is reused on resume.
- iPhone 16 Safari is the launch target. Desktop browsers support review.
- AI may extract and translate receipt facts, but it never decides eligibility,
  allowance or the exchange rate.
  A staged receipt becomes an expense automatically only when the server proves
  that every required field and confidence, reconciliation, duplicate,
  eligibility and trip-link condition is clean. Every exception requires owner
  review.

### Policy behaviour

- JSP 752 v66.1, May 2026 is the versioned launch policy.
- The UK Day Subsistence cap is £30.00 for each confirmed eligible date.
- The claim is the lower of eligible receipted actual spend and the applicable
  cap.
- Meal context is descriptive and never affects the calculation.
- The owner records a custom eligible amount for mixed receipts. Alcohol and
  other ineligible items are excluded from that amount.
- Gratuities and service charges are included within eligible actual spend and
  remain subject to the same £30 daily limit. The owner excludes alcohol and
  any other ineligible spend from the eligible amount.
- Aggregation is available only for a UK trip of at least two nights.
- The owner explicitly chooses daily or aggregate treatment when creating the
  trip. Confirmed eligible dates define the available cap.
- No unused cap transfers between trips.
- A receipted standalone expense may use the shared £30 cap for its date without
  requiring a trip record. Trips are required only when dates are grouped or
  aggregated.
- The app is a calculation and evidence aid. It does not decide whether duty
  circumstances create entitlement.

### Platform and data

- Codex Sites with Vinext and Vite remains the required hosting platform.
- The production bundle must remain Cloudflare Worker-compatible ESM.
- D1 is authoritative for trips, itinerary legs, expenses, receipt metadata,
  immutable exchange-rate quotes and claim snapshots.
- R2 is authoritative for receipt originals.
- Browser storage holds only the appearance preference and unfinished receipt
  uploads. Financial ledger records remain server-authoritative.
- Private Sites access is the mandatory outer security boundary.
- Dispatcher-owned Sign in with ChatGPT supplies the authenticated identity.
  Every page-backed API validates the identity against the single configured
  owner as a second boundary behind the private Sites access policy.
- No secret, owner identity or runtime credential belongs in source control.
- Receipt originals remain in private R2. A browser-normalised JPEG derivative
  is sent to OpenAI only when the owner requests analysis.
- Direct HEIC and HEIF uploads retain the original evidence and create a
  bounded JPEG sidecar for private browser preview and DOCX embedding.
- The permanent OpenAI key is server-only. Safari voice clarification receives
  only a short-lived Realtime client secret. Voice-first trip creation follows
  the same boundary and requires explicit spoken confirmation before saving.
- Multilingual unattended confirmation requires independent image reads to
  agree on the original date, amount, currency and country, plus a deterministic
  conversion and every existing duplicate, arithmetic and trip-link check.

## 3. Improvement release definition of done

The release keeps a single visual and interaction thesis: a calm near-black and
navy receipt desk where evidence and the next required action dominate. Policy
and system detail stay secondary. Capture, review and submission use fast view
transitions, persistent evidence and explicit inline success or error states.

The release is code-complete only when:

- [x] iPhone-width receipt review keeps the original image visible while the
  owner checks and edits AI suggestions.
- [x] Required location and duty reason are visible before batch capture. Trip
  and meal context remain optional.
- [x] Confirming a receipt removes it from the active inbox and advances to the
  next pending item.
- [x] Unconfirmed August or undated receipt intakes block claim preparation and
  provide a route back to Capture.
- [x] Unlocked expense correction includes date, merchant, total, eligible
  amount, service charge or tip, location, duty reason, meal context and trip.
- [x] Expense deletion is recoverable: the D1 row, receipt metadata and private
  R2 evidence remain intact, and Recently deleted can restore the record.
- [x] Deleted expenses are excluded from dashboards and claim snapshots.
  Prepared or submitted periods remain locked against deletion or restoration.
- [x] Claim preparation acquires a D1 period lock before reading figures, and
  database triggers reject racing expense, receipt, intake and trip mutations.
- [x] The August submission pack provides copy-ready where-and-why text plus
  private View and Download actions for each stored receipt.
- [x] Opening a confirmed expense exposes its private receipt image with an
  explicit original-file download action, and audit-response DOCX reports embed
  the available receipt evidence. HEIC and HEIF originals use bounded JPEG
  sidecars where an image-compatible representation is required.
- [x] Receipt analysis suggests the claim date, time, location, duty reason and
  meal context. Confirmation is reduced to exception review, an optional trip
  link, an explicit leave-unlinked choice and an optional short owner
  justification.
- [x] Receipt processing uses an immersive staged overlay with batch position,
  reduced-motion support and retry. Bounded polling exits a persistent
  `in_progress` state. Server-side policy automatically confirms only clean
  high-confidence receipts and routes all other results to exception review.
- [x] Unattended confirmation requires an independent image-only verification
  pass. Owner-provenance required fields and any verifier disagreement force
  owner review.
- [x] A receipt date links automatically only when exactly one owner-scoped,
  eligible confirmed trip matches. Explicit selections win and overlapping
  trips remain a blocking review exception.
- [x] Voice-first trip creation collects a strict draft through an ephemeral
  Realtime session, enforces draft-before-readback ordering and saves only after
  explicit spoken confirmation. Manual creation remains available as the
  privacy and compatibility fallback.
- [x] Claims uses a selectable calendar month and distinguishes pending
  estimates, confirmed eligible spend, policy-eligible spend, claimable spend,
  blocked confirmed spend and food spend above the daily limit.
- [x] JSP 752 regression tests cover claimable actual spend, one global £30 cap
  per non-aggregated date, permitted gratuities and service charges, the
  two-night aggregation threshold, alcohol exclusion by eligible amount and
  evidence failures.
- [x] `npm test` (the production build and all 130 tests), `npm run lint`,
  `npx tsc --noEmit` and `git diff --check` pass on the exact release source.
- [ ] API and D1/R2 integration tests prove owner scoping, state transitions,
  failure recovery and claim-lock concurrency.
- [ ] Real iPhone 16 Safari acceptance proves camera and Photo Library JPEG and
  HEIC capture, background/retry, receipt review, download and microphone
  permission.
- [ ] A non-sensitive receipt fixture set and the initial failed receipts prove
  deployed Sol extraction accuracy field by field.
- [ ] A recovery drill proves structured records and receipt objects can be
  reconciled or restored.

Until every unchecked acceptance item is complete, ExpenseTracker remains a
private provisional beta rather than a formal system of record.

## 4. Milestones

| Milestone | Status | Outcome |
| --- | --- | --- |
| M0: product and policy definition | Complete | Owner-only scope, August workflow and JSP 752 rules agreed |
| M1: manual expense ledger | Complete | Capture, receipt upload, expense list, complete edit and recoverable delete implemented |
| M2: trips and calculation | Complete | Eligible dates, attestation, daily calculation and qualifying aggregation implemented |
| M3: claim preparation | Complete | Readiness checks, hashed immutable snapshot and manual submitted status implemented |
| M4: local verification | Complete | Production build, focused automated tests and local HTTP smoke check recorded |
| M5: launch hardening | Complete | Reviews, dependency updates, edge-case fixes and local end-to-end smoke checks completed |
| M6: private Sites release | Complete | Version 1 deployed successfully with owner-only access |
| M7: protected receipt inbox and AI review | Complete | Batch capture, human-reviewed extraction, scoped voice clarification, audit and export implemented |
| M8: release validation and private Sites version 2 | Complete | Full checks, migration rehearsal, private deployment and owner smoke test |
| M9: real-device acceptance | Backlog | iPhone 16 HEIC, microphone permission and Safari backgrounding tests |
| M10: receipt-first calendar and navigation | Complete | Working-week, week and month review, date-led capture, darker theme and clearer current-view state |
| M11: trusted capture and submission handoff | Complete in code | Mobile evidence review, corrected policy, pending-intake claim gate, recovery and submission pack |
| M12: evidence assurance and resilient operations | Complete in code | Targeted receipt re-checks, duplicate and arithmetic review, offline-resilient queue, submission/recovery ZIPs and service status |
| M13: automated claim capture and auditable evidence | Complete in code | AI-assisted context defaults, receipt viewing and download, receipt images in audit reports, selectable claim periods and clearer claim totals |
| M14: low-touch capture and voice trip creation | Complete in code | Immersive staged processing, strict server auto-confirm, owner-scoped automatic trip linking and explicitly confirmed Realtime trip drafts |
| M15: confirmation and evidence race hardening | Complete in code | Image-only verification, HEIC/HEIF preview sidecars, bounded polling and migration 0006 concurrency guards |
| M16: international evidence and multi-country travel | Complete in code | Multilingual extraction and translation, immutable ECB conversion, original-currency audit evidence, ordered trip legs and country-aware automatic matching |

## 5. Implemented MVP checklist

### Interface and workflow

- [x] Responsive mobile and desktop shell with receipt Capture, Calendar,
  Expenses, Trips, Audit response and Settings views.
- [x] Persistent current-view context and strong active navigation states,
  including an explicit Settings label on mobile.
- [x] Five-item mobile bottom navigation for frequent actions, with Audit
  response directly available and Statistics and Settings available through
  More.
- [x] Working-week, week and month calendar modes with daily claim totals,
  receipt evidence links and date-led receipt capture.
- [x] iPhone-oriented camera or Photo Library input with a local preview.
- [x] Manual expense entry for date, merchant, receipt total, eligible amount,
  location, duty reason, optional meal context and optional trip.
- [x] Receipt confirmation pre-fills date, time, location, duty reason and
  time-derived meal context from AI analysis, leaving optional trip linkage and
  short owner justification as the normal manual inputs. The owner can
  explicitly leave the receipt unlinked.
- [x] Two-step save in which the expense record is created before the receipt is
  uploaded, with a retry route when the upload fails.
- [x] Expense ledger with text search, readiness filters, receipt viewing,
  complete editing, Recently deleted and restoration.
- [x] Trip creation with ordered multi-country itinerary legs, eligible-day
  selection, owner attestation and daily or aggregate method selection.
- [x] Voice-first trip creation with an ephemeral Realtime credential, strict
  multi-leg structured draft, audible readback and explicit spoken save
  confirmation, with the complete manual form retained as fallback.
- [x] One-action Realtime trip creation with spoken questions, a typed fallback
  that preserves partial progress, and a separate recorded-trip ledger.
- [x] Natural Realtime trip opening, proactive missing-detail collection and
  immediate creation after the complete readback receives clear approval.
- [x] Multilingual receipt extraction with ISO currency, country and language
  detection, structured English translation and original minor-unit values.
- [x] Deterministic foreign-currency conversion using a bounded official ECB
  lookup, immutable quote provenance and exact integer rational arithmetic.
- [x] Original and GBP amounts, translation and conversion provenance in
  review, ledger, protected exports, claim packages and audit-response reports.
- [x] Today summary, period-based claim metrics, a plain-language
  before-submission action list and claim-package creation.
- [x] Theme-aware interactive expense map with persistent Dark, Detailed and
  Classic layer choices, close venue zoom and repeat-weighted receipt dots.
- [x] Read-only policy information and system, light or dark appearance choice.
- [x] Branded application icon, logo, manifest and Open Graph asset.
- [x] Up to 20 receipt photos per selection with two concurrent uploads.
- [x] Per-receipt queue states, retry-safe staging and manual review fallback.
- [x] Immersive receipt-processing state with staged activity, batch progress,
  reduced-motion behaviour, bounded `in_progress` polling and an explicit
  failure retry.
- [x] Browser-side orientation-aware JPEG analysis derivative capped at 4096 px.
- [x] Structured receipt extraction with merchant, date, totals, line items,
  uncertainty and suspected-alcohol review.
- [x] Typed clarification and explicit opt-in Realtime voice clarification.
- [x] Crop, rotation and contrast controls for a disposable analysis derivative
  while the secured original remains unchanged.
- [x] Targeted merchant, date, total and eligible-amount AI re-checks that
  preserve owner corrections outside the selected field.
- [x] Possible-duplicate comparison, receipt-line reconciliation and explicit
  acknowledgement before confirmation.
- [x] Append-only AI/manual/voice correction revisions and owner-vs-AI
  provenance.
- [x] An independent image-only verification pass gates unattended
  confirmation. Required facts with owner provenance are never silently
  auto-confirmed.
- [x] IndexedDB upload recovery with truthful queued, offline, uploading and
  review states. Private APIs and pages are never service-worker cached.

### Persistence and server boundaries

- [x] D1 schema and initial Drizzle migration for trips, trip days, expenses,
  receipts and claim snapshots.
- [x] Server repositories for expense, trip, receipt and claim operations.
- [x] Server-side validation for dates, text lengths, integer pence, fixed GBP and
  GB jurisdiction, eligible totals and trip boundaries.
- [x] Same-origin checks on state-changing API requests.
- [x] Bounded JSON request bodies and a 20 MB receipt limit.
- [x] JPEG, PNG, HEIC and HEIF receipt signature validation.
- [x] Direct HEIC and HEIF uploads retain their originals and gain bounded JPEG
  sidecars for preview and document embedding.
- [x] Idempotency keys, SHA-256 exact-duplicate detection and opaque R2 object
  keys.
- [x] R2 cleanup when receipt metadata persistence fails.
- [x] `no-store`, private receipt responses with `nosniff`.
- [x] Owner validation on every API and owner-scoped D1 and R2 access.
- [x] Owner-scoped automatic trip matching that preserves explicit choices,
  including leave-unlinked, accepts one eligible confirmed date match and
  blocks overlapping matches for review.
- [x] Server-enforced receipt auto-confirmation with strict field-confidence,
  independent image verification, provenance, reconciliation, duplicate,
  eligibility and trip-link gates.
- [x] Migration `0006_parched_prism.sql` reserves duplicates per owner and adds
  atomic guards around trip selection and expense insertion. Tokenised
  five-minute leases gate every automatic write and recover expired or stale
  tokenless analysis to review.
- [x] Append-only safe audit events for financial mutations and receipt review.
- [x] Protected JSON and formula-injection-safe CSV exports.
- [x] Server-only OpenAI key use, ephemeral Realtime browser credentials and
  graceful manual operation when AI is not configured.

### Calculation and claims

- [x] Integer-pence calculations with a versioned £30.00 UK daily cap.
- [x] Actual-spend ceiling, daily capping and deterministic expense allocation.
- [x] Two-night minimum for aggregation and cap calculation from confirmed
  eligible days.
- [x] Present daily versus pooled limits as an explicit trip setting. Realtime
  voice does not ask another question and defaults qualifying UK trips to
  aggregation; the owner can change it in Trip details.
- [x] Claim blocking when a receipt or linked-trip eligible day is unconfirmed,
  or when currency, country or cross-period aggregation is unsupported.
- [x] Standalone receipted expenses share the £30 cap for their service date.
- [x] Standalone and non-aggregated trip expenses share one global £30 cap when
  they fall on the same service date.
- [x] Gratuities and service charges remain in eligible actual spend and inside
  the same daily or aggregate allowance ceiling.
- [x] Pending or undated receipt intakes block claim preparation.
- [x] Prepared claim periods lock expenses, receipts and overlapping trips.
- [x] A recoverable `preparing` period lock closes the read-to-snapshot race and
  is finalised with the immutable claim.
- [x] August 2026 claim snapshot containing policy, expenses, trips and
  calculation.
- [x] SHA-256 snapshot digest, one prepared snapshot per period and manual
  prepared-to-submitted transition.
- [x] Owner-only size-bounded claim ZIP parts built from the verified frozen
  snapshot, containing a PDF summary, formula-safe CSV, global manifest and
  checksum-verified originals.
- [x] Owner-triggered audit-response Word reports include available receipt
  images alongside the evidence register, with private receipt view and
  download controls remaining available from the ledger.
- [x] Owner-only size-bounded multipart recovery ZIPs containing the ledger,
  original evidence, global checksums and a non-destructive recovery guide.
- [x] Manual byte-level evidence-integrity report for missing, size-mismatched,
  hash-mismatched and unlinked R2 objects.

## 6. Verification gates

Completed gates are checked only where the repository contains an implemented
control and the development record contains verification evidence.

### Recorded local evidence

- [x] Production Vinext build completed on 28 July 2026.
- [x] Rendered-output checks confirmed the Worker bundle, client manifest,
  migration packaging, hosting bindings and branded assets.
- [x] Focused JSP 752 tests covered the global daily cap, actual-spend ceiling,
  qualifying aggregation, short-trip rejection, permitted gratuities, missing
  evidence and non-GB rejection.
- [x] Local HTTP smoke check completed.
- [ ] Split the remaining touched hand-written TypeScript and TSX files that
  exceed the preferred 350-line target. All currently remain below 400 lines.
- [x] Final `npm test` completed the production build and all 130 tests.
- [x] Final `npm run lint`, `npx tsc --noEmit` and `git diff --check` passed.
- [x] Receipt-calendar input validation and calculation mapping tests passed.
- [x] Production dependency audit reported zero known vulnerabilities.
- [x] Local D1/R2 smoke flow covered standalone create, receipt upload,
  idempotent upload retry, claim preparation, evidence locking and submission.

### Required before a saved Sites version

- [x] Run and record `npm run lint`.
- [x] Run and record the complete build and test suite.
- [ ] Add or run API integration tests against local D1 and R2 for create, edit,
  delete, receipt retrieval, claim preparation and failure responses.
- [ ] Add or run focused upload tests for malformed files, oversize streamed
  bodies, duplicate hashes, idempotency conflicts and missing R2 objects.
- [ ] Confirm the initial migration applies to a clean D1 database and that the
  packaged migration matches the schema.
- [x] Perform code-level keyboard, focus, label and colour-contrast checks for
  the calendar and navigation update.
- [ ] Complete real-browser reduced-motion and mobile VoiceOver checks.
- [x] Confirm no secrets or personal data are present in source, build output or
  logs.

### Required before production deployment

- [x] Keep the public GitHub `origin` untouched and push only to the private
  Sites source repository.
- [x] Commit the exact verified source and push the feature branch to Sites.
- [x] Create or connect exactly one Sites project and retain its opaque project
  identifier in `.openai/hosting.json`.
- [x] Configure D1 and R2 bindings and package the initial migration.
- [x] Configure owner-only Sites access and verify an unauthorised account cannot
  reach pages, APIs or receipt objects.
- [x] Enforce the verified Sites principal against a server-side owner allowlist.
- [x] Confirm the applicable JSP 752 release immediately before launch.
- [ ] Test camera capture, Photo Library selection, JPEG and a real iPhone HEIC
  receipt on iPhone 16 Safari.
- [ ] Test upload retry after Safari backgrounding or a simulated network
  interruption.
- [ ] Document and prove a viable D1 and R2 recovery or owner export route before
  real data is stored, or explicitly accept the reduced recovery position.
- [x] Save an immutable Sites version from the verified source commit.
- [x] Obtain explicit approval for the production deployment.

### Required immediately after deployment

- [x] Confirm the deployment reaches a successful terminal state.
- [x] Open the deployment as the owner and confirm an unauthenticated request is
  denied with `401`.
- [ ] With synthetic data, create a trip, capture a receipt, create and edit an
  expense, verify daily and aggregate calculations, prepare the August snapshot
  and mark it submitted.
- [ ] Confirm direct receipt retrieval is private and non-cacheable.
- [ ] Repeat the core capture and claims flow on iPhone and desktop.
- [ ] Remove all synthetic records and receipt objects.
- [ ] Record the deployed version, migration version, smoke evidence and rollback
  candidate.

## 7. Known MVP constraints

- Production version 1 is deployed with one allowed owner and no allowed groups.
- The app remains deliberately single-owner. There is no invitation,
  organisation or delegated reviewer workflow.
- The product is fixed to August 2026, GB, GBP and JSP 752 v66.1.
- Standalone day claims are supported. Aggregated trips that cross the August
  boundary are deliberately blocked for manual review.
- The trip UI creates trips but does not edit or delete them, although a server
  update route exists.
- The custom eligible amount supports mixed receipts and the editor exposes a
  separate service charge or tip amount, but there is no line-item allocation.
- Receipt originals are stored as uploaded for evidence. The analysis copy is
  normalised in Safari, but the original is not metadata-stripped and no malware
  scanner is currently available.
- HEIC and HEIF signatures, preserved originals and JPEG preview sidecars are
  implemented, but real-device display and end-to-end behaviour have not been
  verified.
- The immersive processing overlay, reduced-motion path and failure recovery
  have code-level coverage, but still require real iPhone Safari, VoiceOver and
  interrupted-network acceptance.
- Expense deletion is recoverable and retains receipt evidence. There is not yet
  a separate owner-approved purge or retention workflow.
- Prepared claim snapshots and their source periods are locked. There is no
  correction or superseding-snapshot workflow yet.
- Only one snapshot may exist for August 2026. A prepared claim cannot be
  replaced through the current product.
- The Expenses view includes the routine monthly claim-package workflow,
  private receipt View and Download actions and copy-ready where-and-why
  descriptions. Direct sharing is not used because a private authenticated URL
  is unsuitable for an external recipient.
- Monthly claim totals are period-scoped rather than Today-only. An uploaded
  receipt remains a pending estimate until it is confirmed as an expense, so
  pending and confirmed figures are deliberately presented separately.
- JSON, CSV and portable multipart recovery ZIP exports are available.
  Automatic restore, delete-all and scheduled off-site backups remain
  deliberately unavailable.
- Interrupted uploads resume while the app is open or when it returns online.
  iOS does not guarantee a background upload after Safari is terminated, and
  the app does not claim that it does.
- Automated coverage is focused rather than comprehensive. API authorisation,
  browser accessibility, migration recovery and iPhone tests remain open.
- Operational status separates configuration from the last recorded successful
  extraction and exposes the current receipt, Realtime and transcription
  models. One synthetic or non-sensitive receipt and one iPhone Safari
  microphone session remain required acceptance tests.
- Voice trip creation sends microphone audio and the structured trip dialogue
  to OpenAI only after the owner starts the session. Spoken readback and save
  confirmation, microphone denial and the manual fallback still require
  real-device end-to-end verification.
- ExpenseTracker has no general-purpose chat feature. Its bounded Policy
  assistant answers JSP 752 questions without ledger access. The complete
  663-page v66.1 PDF and a hashed per-page text corpus are stored in the
  release. It retrieves relevant local pages before calling
  `OPENAI_POLICY_MODEL`, requires a current official GOV.UK search and exposes
  both stored page links and official source citations. Receipt extraction and
  Realtime voice remain separate purpose-limited model workflows.
- Receipt extraction now requests `gpt-5.6-sol` with original image detail and
  high reasoning effort. This deliberately prioritises quality over the lower
  latency and cost of the previous Luna configuration.

## 8. Risks and mitigations

| Risk | Current mitigation and required action |
| --- | --- |
| Private evidence becomes publicly reachable | Do not deploy or enter real data until owner-only Sites access and direct receipt denial are verified |
| Same-origin checks are mistaken for authentication | Treat private Sites access as mandatory and add server-side owner checks when a verified principal is available |
| Submitted source data changes after snapshot | Prepared-period source locking preserves evidence; add a correction workflow before supporting amendments |
| Accidental deletion hides evidence | Soft delete keeps D1 and R2 evidence; add an explicit retention and purge policy before permanent deletion |
| HEIC succeeds at upload but fails during review | Verify the JPEG preview sidecar and original download with real iPhone fixtures |
| Receipt metadata leaks device or location details | Add metadata-stripped previews and define whether originals must retain metadata |
| D1 succeeds while R2 fails, or the reverse | Existing retry and cleanup reduce the risk; add reconciliation and recovery tests |
| JSP 752 changes | Verify the current official release before launch and add effective-dated policy versions before supporting later periods |
| Aggregation is used incorrectly | Keep the two-night rule, explicit method choice, confirmed dates and regression tests |
| Repository visibility exposes personal application code | Verify the remote is private before the first push |
| No proven backup or export exists | Use synthetic data only until a recovery or export route is demonstrated or the owner explicitly accepts the risk |
| Focused tests miss route or browser regressions | Complete API, upload, accessibility and iPhone gates before deployment |
| A map dot implies more precision than the receipt supports | Persist a precision label and evidence string, treat the point as an analytics hint, and render older or incomplete records as explicit city or country fallbacks |
| External basemap requests reveal the visible map area | Load the selected CARTO or OpenStreetMap layer only inside Statistics, send no claim text or receipt images, retain provider attribution, and document the boundary for the owner |
| WebGL is unavailable or disabled on an owner device | Use Leaflet's DOM and SVG renderer, keep dots usable when street tiles fail, and show a truthful tile-status message |

## 9. Post-MVP priorities

### Priority 1: safety and submission completeness

- [ ] Wire verified owner identity into every protected page and API where Sites
  exposes a stable principal.
- [x] Add a protected full recovery export and documented staged recovery
  procedure.
- [ ] Add verified delete-all and a reviewed empty-ledger restore tool.
- [x] Add soft delete and restore without deleting receipt evidence.
- [x] Add receipt reconciliation.
- [ ] Add an explicit protected purge workflow.
- [x] Lock source records before and after claim preparation at the D1 boundary.
- [ ] Implement corrections with superseding claim snapshots.
- [x] Add receipt view or download and copy-ready where-and-why description
  actions.
- [ ] Add metadata-stripped, correctly oriented receipt previews with pixel and
  decompression limits.
- [ ] Add trip editing and deletion with claim-integrity safeguards.
- [ ] Expand API, security, accessibility and browser regression coverage.

### Priority 2: lower-friction review

- [x] Add server-side receipt extraction for merchant, date and total as
  untrusted suggestions requiring confirmation.
- [x] Add line-item review and warnings for alcohol or other ineligible spend.
- [x] Allow an unconfirmed receipt to be read again from its secured analysis
  copy after a model upgrade or an inaccurate first result.
- [x] Automatically link a receipt to the sole owner-scoped eligible confirmed
  trip on its date, while preserving explicit selection and treating overlaps
  as review exceptions.
- [ ] Add receipt text search and saved filters.
- [x] Add an explicit offline capture queue with clear device-only and
  server-saved states.
- [x] Add stoppable upload and AI-processing controls, bounded
  metadata-stripped analysis preparation, and clear exact-duplicate feedback.
- [x] Recover interrupted receipt analysis on removal using a guarded
  operation lease, while preserving active-work, claim-lock, late-result and
  tombstone-backed evidence deletion safeguards.
- [x] Keep the strict receipt schema within OpenAI's supported JSON Schema
  subset, report provider failures truthfully, and let incomplete receipts be
  re-read without first saving invalid blank fields.
- [x] Add dedicated Audit response and month-scoped Statistics navigation.
- [x] Add an owner-only, sourced JSP 752 Policy assistant under More on mobile.
- [x] Let the owner choose text chat or Realtime voice for JSP 752 questions,
  while routing both modes through the same stored-policy retrieval, current
  GOV.UK check and citation boundary.
- [x] Store the complete official JSP 752 v66.1 PDF and searchable 663-page
  corpus in the app, verify the source hash, and retrieve local passages before
  each live GOV.UK-checked answer.
- [x] Explain the three Expenses jobs, active filters, receipt ledger and
  monthly package in short plain English.
- [x] Add privacy-preserving restaurant, food-style, meal-context, daily-spend
  and country-level location visualisations without live geocoding.
- [x] Add filters, period comparison, allowance heatmaps, receipt-line-item
  food analysis, currency analysis and tap-through claim inspection.
- [x] Add week, month, three-month and annual Statistics ranges with
  like-for-like preceding-period comparisons.
- [x] Add controlled AI semantic food-style tags plus deterministic merchant
  and line-item fallbacks for existing receipt records.
- [x] Add close-detail interactive mapping with evidence-backed receipt
  coordinates, clustered repeat visits and honest city/country fallbacks.
- [x] Capture the trip name, location, dates and short justification from one
  natural voice description, keep recognised facts monotonic, avoid repeated
  date questions, and default a qualifying UK trip to aggregate calculation
  without adding a voice question. Preserve a final spoken readback and
  explicit save approval, while keeping the calculation choice editable in
  Trip details.
- [x] Keep automatic and owner-confirmed receipt ledger inserts aligned with
  the expense schema, with regression coverage for SQL value counts.
- [x] Support selections of at least ten receipts through one global bounded
  queue, with a twenty-item admission limit, two concurrent receipt workflows
  and serial high-resolution image preparation.
- [x] Make bulk capture recoverable across reloads and transient failures by
  storing files separately from queue state, resuming from authoritative server
  status, retaining failed items for explicit retry and cleaning terminal data.
- [x] Harden R2/D1 partial-failure and duplicate handling so concurrent bulk
  uploads cannot mask the primary error or strand untracked receipt evidence.
- [x] Make IndexedDB file/state persistence atomic and sequential per selected
  batch, preserve a secured-evidence retry path, and reject hostile oversized
  JPEG/PNG dimensions before browser decode.
- [x] Make manual receipt confirmation idempotent across overlapping Safari
  requests, returning the existing confirmed expense and settling in-flight
  conflicts without repeated button presses.
- [x] Detect strong shared-order patterns from extracted quantities and meal
  composition, ask which items belong to the owner, and avoid flagging an
  ordinary one-person meal with sides and a drink.
- [x] Use original-detail vision for extraction and verification, strengthen
  quantity instructions and reduce unnecessary confidence-only review while
  retaining exact verification, arithmetic, alcohol and duplicate safeguards.

### Priority 3: broader use only when justified

- Additional claim periods and effective-dated policy updates.
- Employer-approved alternatives to ECB reference rates and overseas allowance
  policies. The current implementation converts evidence into the existing GBP
  JSP 752 ledger and does not invent a separate overseas entitlement policy.
- Alternative employer submission templates.
- Bank matching, accounting integrations or delegated access.

Public registration, advertising, payment initiation and AI-made entitlement
decisions remain out of scope.

## 10. Current next step

Verify the automated date, location, duty-reason and meal-context suggestions
against a non-sensitive receipt set, including weak or missing receipt fields.
Include paired meal sets, a ten-item shared order and a one-person meal with
several sides to measure shared-receipt precision and false positives.
Measure low-reasoning, 5 MP receipt latency and accuracy against the same set
before deciding whether difficult receipts need an automatic higher-reasoning
or larger-image retry.
Run a live ten-receipt iPhone Safari acceptance batch containing JPG, HEIC, an
exact duplicate and one intentionally poor image. Confirm truthful per-item
progress, bounded concurrency, cancellation, retry and reload recovery.
Complete the iPhone 16 HEIC, Safari backgrounding, receipt view/download,
receipt-bearing audit report, immersive processing and Realtime microphone
acceptance checks before treating AI-assisted capture as proven. Exercise a
single-utterance voice trip in the form “name, location, dates, reason”, plus
multi-country ordering, one genuinely missing detail, readback and explicit
spoken save confirmation. Also check manual fallback, unique automatic trip
matching, explicit leave-unlinked and overlapping-trip exception review end to
end. Complete an empty-environment recovery drill before treating the app as a
formal system of record.
