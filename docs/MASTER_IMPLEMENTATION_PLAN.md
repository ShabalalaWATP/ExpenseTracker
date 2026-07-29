# ExpenseTracker Master Implementation Plan

Status: Private provisional beta, real-device and recovery acceptance pending
Deployment: Private Sites production, with immutable release history in Sites
Primary client: iPhone 16 using Safari
Initial claim period: August 2026
Source repository: `ShabalalaWATP/ExpenseTracker`
Policy baseline: JSP 752 v66.1, May 2026
Last updated: 29 July 2026

## 1. Vision and current position

ExpenseTracker is a private, mobile-first evidence and expense-claim aid for one
owner. Its first purpose is to support an August 2026 UK Day Subsistence claim:
capture a receipt, confirm the eligible amount and duty context, calculate the
claim under JSP 752, and freeze a reviewed monthly snapshot.

The local MVP is implemented. It includes the receipt-first responsive
application, calendar review, D1 data
model, R2 receipt storage path, deterministic policy calculation, trip
attestation, readiness checks and claim snapshots. A production-compatible
build, focused policy tests and a local HTTP smoke check were recorded on
28 July 2026.

The application is privately deployed. The owner-only Sites boundary and
unauthenticated denial have been verified. Real iPhone HEIC capture and the
recovery position remain manual follow-up items before the app is treated as a
formal system of record.

ExpenseTracker is not a budgeting product, accounting system, entitlement
decision-maker, employer approval workflow, payment service or public SaaS
product.

## 2. Preserved product and architecture decisions

### Product boundary

- One owner only, with no public registration, invitations or organisations.
- GBP and UK expenses only in the MVP.
- August 2026 is the only supported claim period.
- Online-first capture. An upload is saved only after the server acknowledges it.
- iPhone 16 Safari is the launch target. Desktop browsers support review.
- AI may suggest receipt facts, but it never decides eligibility or allowance.
  Every staged receipt requires owner confirmation before it becomes an expense.

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
- D1 is authoritative for trips, expenses, receipt metadata and claim snapshots.
- R2 is authoritative for receipt originals.
- Browser storage is used only for the local appearance preference.
- Private Sites access is the mandatory outer security boundary.
- Dispatcher-owned Sign in with ChatGPT supplies the authenticated identity.
  Every page-backed API validates the identity against the single configured
  owner as a second boundary behind the private Sites access policy.
- No secret, owner identity or runtime credential belongs in source control.
- Receipt originals remain in private R2. A browser-normalised JPEG derivative
  is sent to OpenAI only when the owner requests analysis.
- The permanent OpenAI key is server-only. Safari voice clarification receives
  only a short-lived Realtime client secret.

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
- [x] JSP 752 regression tests cover claimable actual spend, one global £30 cap
  per non-aggregated date, permitted gratuities and service charges, the
  two-night aggregation threshold, alcohol exclusion by eligible amount and
  evidence failures.
- [x] TypeScript, ESLint, production build, migration rehearsal and the complete
  automated suite pass on the exact release source.
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

## 5. Implemented MVP checklist

### Interface and workflow

- [x] Responsive mobile and desktop shell with receipt Capture, Calendar,
  Expenses, Trips, Claims and Settings views.
- [x] Persistent current-view context and strong active navigation states,
  including an explicit Settings label on mobile.
- [x] Working-week, week and month calendar modes with daily claim totals,
  receipt evidence links and date-led receipt capture.
- [x] iPhone-oriented camera or Photo Library input with a local preview.
- [x] Manual expense entry for date, merchant, receipt total, eligible amount,
  location, duty reason, optional meal context and optional trip.
- [x] Two-step save in which the expense record is created before the receipt is
  uploaded, with a retry route when the upload fails.
- [x] Expense ledger with text search, readiness filters, receipt viewing,
  complete editing, Recently deleted and restoration.
- [x] Trip creation with UK dates, eligible-day selection, owner attestation and
  daily or aggregate method selection.
- [x] Today summary, August totals, attention list and claim-readiness display.
- [x] Read-only policy information and system, light or dark appearance choice.
- [x] Branded application icon, logo, manifest and Open Graph asset.
- [x] Up to 20 receipt photos per selection with two concurrent uploads.
- [x] Per-receipt queue states, retry-safe staging and manual review fallback.
- [x] Browser-side orientation-aware JPEG analysis derivative capped at 4096 px.
- [x] Structured receipt extraction with merchant, date, totals, line items,
  uncertainty and suspected-alcohol review.
- [x] Typed clarification and explicit opt-in Realtime voice clarification.

### Persistence and server boundaries

- [x] D1 schema and initial Drizzle migration for trips, trip days, expenses,
  receipts and claim snapshots.
- [x] Server repositories for expense, trip, receipt and claim operations.
- [x] Server-side validation for dates, text lengths, integer pence, fixed GBP and
  GB jurisdiction, eligible totals and trip boundaries.
- [x] Same-origin checks on state-changing API requests.
- [x] Bounded JSON request bodies and a 20 MB receipt limit.
- [x] JPEG, PNG, HEIC and HEIF receipt signature validation.
- [x] Idempotency keys, SHA-256 exact-duplicate detection and opaque R2 object
  keys.
- [x] R2 cleanup when receipt metadata persistence fails.
- [x] `no-store`, private receipt responses with `nosniff`.
- [x] Owner validation on every API and owner-scoped D1 and R2 access.
- [x] Append-only safe audit events for financial mutations and receipt review.
- [x] Protected JSON and formula-injection-safe CSV exports.
- [x] Server-only OpenAI key use, ephemeral Realtime browser credentials and
  graceful manual operation when AI is not configured.

### Calculation and claims

- [x] Integer-pence calculations with a versioned £30.00 UK daily cap.
- [x] Actual-spend ceiling, daily capping and deterministic expense allocation.
- [x] Two-night minimum for aggregation and cap calculation from confirmed
  eligible days.
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
- [x] Hand-written TypeScript and TSX source files remain below the 350-line
  project target.
- [x] TypeScript, ESLint and the complete `npm test` command passed.
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
- [ ] Confirm the applicable JSP 752 release immediately before launch.
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
- HEIC and HEIF signatures are accepted, but real-device display and end-to-end
  behaviour have not been verified.
- Expense deletion is recoverable and retains receipt evidence. There is not yet
  a separate owner-approved purge or retention workflow.
- Prepared claim snapshots and their source periods are locked. There is no
  correction or superseding-snapshot workflow yet.
- Only one snapshot may exist for August 2026. A prepared claim cannot be
  replaced through the current product.
- The claims view provides private receipt View and Download actions and
  copy-ready where-and-why descriptions. Direct sharing is not used because a
  private authenticated URL is unsuitable for an external recipient.
- JSON and CSV exports are available, but receipt-image archives, delete-all,
  scheduled backups, restore tooling and a recovery drill remain outstanding.
- There is no offline queue, background upload, notification or automated
  monitoring.
- Automated coverage is focused rather than comprehensive. API authorisation,
  browser accessibility, migration recovery and iPhone tests remain open.
- AI status confirms configuration and endpoint availability, not successful
  end-to-end receipt understanding. One synthetic or non-sensitive receipt and
  one iPhone Safari microphone session remain required acceptance tests.
- ExpenseTracker has no general chat feature. The removed `OPENAI_CHAT_MODEL`
  setting was unused; receipt extraction and Realtime voice are the only model
  workflows exposed by the app.
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
| HEIC succeeds at upload but fails during review | Verify real iPhone fixtures and add a normalised preview derivative if needed |
| Receipt metadata leaks device or location details | Add metadata-stripped previews and define whether originals must retain metadata |
| D1 succeeds while R2 fails, or the reverse | Existing retry and cleanup reduce the risk; add reconciliation and recovery tests |
| JSP 752 changes | Verify the current official release before launch and add effective-dated policy versions before supporting later periods |
| Aggregation is used incorrectly | Keep the two-night rule, explicit method choice, confirmed dates and regression tests |
| Repository visibility exposes personal application code | Verify the remote is private before the first push |
| No proven backup or export exists | Use synthetic data only until a recovery or export route is demonstrated or the owner explicitly accepts the risk |
| Focused tests miss route or browser regressions | Complete API, upload, accessibility and iPhone gates before deployment |

## 9. Post-MVP priorities

### Priority 1: safety and submission completeness

- [ ] Wire verified owner identity into every protected page and API where Sites
  exposes a stable principal.
- [ ] Add protected full export, verified delete-all and a documented restore
  route.
- [x] Add soft delete and restore without deleting receipt evidence.
- [ ] Add receipt reconciliation and an explicit protected purge workflow.
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
- [ ] Add receipt text search, saved filters and better expense-to-trip
  suggestions.
- [ ] Add an explicit offline capture queue with clear device-only and
  server-saved states.

### Priority 3: broader use only when justified

- Additional claim periods and effective-dated policy updates.
- Multiple currencies and overseas policies.
- Alternative employer submission templates.
- Bank matching, accounting integrations or delegated access.

Public registration, advertising, payment initiation and AI-made entitlement
decisions remain out of scope.

## 10. Current next step

Re-read the existing unconfirmed receipts with Sol and compare every suggested
field with the image.
Complete the iPhone 16 HEIC, Safari backgrounding, receipt download and Realtime
microphone acceptance checks before treating AI-assisted capture as proven.
Finish route integration, concurrency and recovery drills before treating the
app as a formal system of record.
