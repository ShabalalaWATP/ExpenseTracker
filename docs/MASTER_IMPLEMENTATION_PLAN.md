# ExpenseTracker Master Implementation Plan

Status: MVP built, verified and privately deployed  
Deployment: Sites version 1 is live with owner-only access  
Primary client: iPhone 16 using Safari  
Initial claim period: August 2026  
Source repository: `ShabalalaWATP/ExpenseTracker`  
Policy baseline: JSP 752 v66.1, May 2026  
Last updated: 28 July 2026

## 1. Vision and current position

ExpenseTracker is a private, mobile-first evidence and expense-claim aid for one
owner. Its first purpose is to support an August 2026 UK Day Subsistence claim:
capture a receipt, confirm the eligible amount and duty context, calculate the
claim under JSP 752, and freeze a reviewed monthly snapshot.

The local MVP is implemented. It includes the responsive application, D1 data
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
- AI may suggest values later, but it must never decide eligibility or allowance.

### Policy behaviour

- JSP 752 v66.1, May 2026 is the versioned launch policy.
- The UK Day Subsistence cap is £30.00 for each confirmed eligible date.
- The claim is the lower of eligible receipted actual spend and the applicable
  cap.
- Meal context is descriptive and never affects the calculation.
- The owner records a custom eligible amount for mixed receipts. Alcohol and
  other ineligible items are excluded from that amount.
- A separately identified gratuity is excluded by the current calculation.
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
- Dispatcher-owned Sign in with ChatGPT remains the intended identity mechanism.
  The existing helper is not yet wired into the page or API routes, so the MVP
  currently depends on the Sites owner-only policy rather than application-level
  owner authorisation.
- No secret, owner identity or runtime credential belongs in source control.

## 3. Milestones

| Milestone | Status | Outcome |
| --- | --- | --- |
| M0: product and policy definition | Complete | Owner-only scope, August workflow and JSP 752 rules agreed |
| M1: manual expense ledger | Complete | Capture, receipt upload, expense list, edit and delete implemented |
| M2: trips and calculation | Complete | Eligible dates, attestation, daily calculation and qualifying aggregation implemented |
| M3: claim preparation | Complete | Readiness checks, hashed immutable snapshot and manual submitted status implemented |
| M4: local verification | Complete | Production build, focused automated tests and local HTTP smoke check recorded |
| M5: launch hardening | Complete | Reviews, dependency updates, edge-case fixes and local end-to-end smoke checks completed |
| M6: private Sites release | Complete | Version 1 deployed successfully with owner-only access |
| M7: post-MVP improvements | Backlog | Safety, submission handoff and usability enhancements prioritised below |

## 4. Implemented MVP checklist

### Interface and workflow

- [x] Responsive mobile and desktop shell with Today, Expenses, Capture, Trips,
  Claims and Settings views.
- [x] iPhone-oriented camera or Photo Library input with a local preview.
- [x] Manual expense entry for date, merchant, receipt total, eligible amount,
  location, duty reason, optional meal context and optional trip.
- [x] Two-step save in which the expense record is created before the receipt is
  uploaded, with a retry route when the upload fails.
- [x] Expense ledger with text search, basic readiness filters, receipt viewing,
  editing and deletion.
- [x] Trip creation with UK dates, eligible-day selection, owner attestation and
  daily or aggregate method selection.
- [x] Today summary, August totals, attention list and claim-readiness display.
- [x] Read-only policy information and system, light or dark appearance choice.
- [x] Branded application icon, logo, manifest and Open Graph asset.

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

### Calculation and claims

- [x] Integer-pence calculations with a versioned £30.00 UK daily cap.
- [x] Actual-spend ceiling, daily capping and deterministic expense allocation.
- [x] Two-night minimum for aggregation and cap calculation from confirmed
  eligible days.
- [x] Claim blocking when a receipt or linked-trip eligible day is unconfirmed,
  or when currency, country or cross-period aggregation is unsupported.
- [x] Standalone receipted expenses share the £30 cap for their service date.
- [x] Prepared claim periods lock expenses, receipts and overlapping trips.
- [x] August 2026 claim snapshot containing policy, expenses, trips and
  calculation.
- [x] SHA-256 snapshot digest, one prepared snapshot per period and manual
  prepared-to-submitted transition.

## 5. Verification gates

Completed gates are checked only where the repository contains an implemented
control and the development record contains verification evidence.

### Recorded local evidence

- [x] Production Vinext build completed on 28 July 2026.
- [x] Rendered-output checks confirmed the Worker bundle, client manifest,
  migration packaging, hosting bindings and branded assets.
- [x] Focused JSP 752 tests covered the daily cap, actual-spend ceiling,
  qualifying aggregation, short-trip rejection, gratuity exclusion, missing
  evidence and non-GB rejection.
- [x] Local HTTP smoke check completed.
- [x] Hand-written TypeScript and TSX source files remain below the 350-line
  project target.
- [x] TypeScript, ESLint and the complete `npm test` command passed.
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
- [ ] Perform keyboard, focus, label, contrast and reduced-motion accessibility
  checks.
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
- [ ] Decide whether the verified Sites principal is available to application
  routes. If it is, enforce an owner allowlist server-side. If it is not, record
  the owner-only Sites policy as the accepted singleton boundary.
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

## 6. Known MVP constraints

- Production version 1 is deployed with one allowed owner and no allowed groups.
- ChatGPT identity helpers exist but are not called by the current pages or API
  routes. Same-origin validation is not a substitute for authentication.
- The product is fixed to August 2026, GB, GBP and JSP 752 v66.1.
- Standalone day claims are supported. Aggregated trips that cross the August
  boundary are deliberately blocked for manual review.
- The trip UI creates trips but does not edit or delete them, although a server
  update route exists.
- The custom eligible amount supports mixed receipts, but there is no line-item
  allocation or separate gratuity control in the interface.
- Receipt originals are stored as uploaded. The MVP does not strip metadata,
  normalise orientation, validate pixel dimensions, generate safe previews or
  perform malware scanning.
- HEIC and HEIF signatures are accepted, but real-device display and end-to-end
  behaviour have not been verified.
- Expense deletion is immediate rather than soft-deleted and recoverable.
- Prepared claim snapshots and their source periods are locked. There is no
  correction or superseding-snapshot workflow yet.
- Only one snapshot may exist for August 2026. A prepared claim cannot be
  replaced through the current product.
- The claims view has no dedicated `Share receipt`, `Download receipt` or
  `Copy description` handoff actions.
- There is no full data export, delete-all operation, backup job, restore tool or
  recovery drill.
- There is no AI extraction, OCR, offline queue, background upload, notification
  or automated monitoring.
- Automated coverage is focused rather than comprehensive. API authorisation,
  browser accessibility, migration recovery and iPhone tests remain open.

## 7. Risks and mitigations

| Risk | Current mitigation and required action |
| --- | --- |
| Private evidence becomes publicly reachable | Do not deploy or enter real data until owner-only Sites access and direct receipt denial are verified |
| Same-origin checks are mistaken for authentication | Treat private Sites access as mandatory and add server-side owner checks when a verified principal is available |
| Submitted source data changes after snapshot | Prepared-period source locking preserves evidence; add a correction workflow before supporting amendments |
| Immediate deletion causes unrecoverable loss | Avoid deleting real records until export or recovery exists; prioritise soft delete and protected recovery |
| HEIC succeeds at upload but fails during review | Verify real iPhone fixtures and add a normalised preview derivative if needed |
| Receipt metadata leaks device or location details | Add metadata-stripped previews and define whether originals must retain metadata |
| D1 succeeds while R2 fails, or the reverse | Existing retry and cleanup reduce the risk; add reconciliation and recovery tests |
| JSP 752 changes | Verify the current official release before launch and add effective-dated policy versions before supporting later periods |
| Aggregation is used incorrectly | Keep the two-night rule, explicit method choice, confirmed dates and regression tests |
| Repository visibility exposes personal application code | Verify the remote is private before the first push |
| No proven backup or export exists | Use synthetic data only until a recovery or export route is demonstrated or the owner explicitly accepts the risk |
| Focused tests miss route or browser regressions | Complete API, upload, accessibility and iPhone gates before deployment |

## 8. Post-MVP priorities

### Priority 1: safety and submission completeness

- [ ] Wire verified owner identity into every protected page and API where Sites
  exposes a stable principal.
- [ ] Add protected full export, verified delete-all and a documented restore
  route.
- [ ] Add soft delete, restore and receipt reconciliation.
- [ ] Lock source records after claim preparation and implement corrections with
  superseding claim snapshots.
- [ ] Add explicit receipt share or download and copy-ready where-and-why
  description actions.
- [ ] Add metadata-stripped, correctly oriented receipt previews with pixel and
  decompression limits.
- [ ] Add trip editing and deletion with claim-integrity safeguards.
- [ ] Expand API, security, accessibility and browser regression coverage.

### Priority 2: lower-friction review

- [ ] Add server-side receipt extraction for merchant, date and total as
  untrusted suggestions requiring confirmation.
- [ ] Add line-item review and warnings for alcohol or other ineligible spend.
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

## 9. Current next step

Complete the pre-version verification gates, starting with lint, clean build and
test evidence, local D1 and R2 API integration checks, and the private-repository
verification. Then create or connect the single private Sites project, configure
owner-only access and bindings, save a verified version, and request explicit
approval before production deployment.
