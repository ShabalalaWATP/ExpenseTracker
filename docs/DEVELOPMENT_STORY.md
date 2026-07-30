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

## 30 July 2026

- Replaced the unsafe assumption that every receipt was issued in GBP and GB.
  The receipt pipeline now preserves ISO currency, purchase country, detected
  language and original minor-unit amounts, produces a structured English
  translation, and keeps the original image as the authoritative evidence.
- Added deterministic GBP conversion through a bounded ECB Data Portal lookup.
  Each owner-scoped quote stores its exact rational rate, observation date,
  provider reference and response hash. Integer half-up arithmetic produces the
  frozen GBP ledger value, while unavailable or ambiguous conversions remain
  in exception review.
- Extended the independent image-only verification gate to currency and
  country. A foreign receipt can bypass manual field confirmation only when both
  image reads agree on critical printed facts and all conversion, arithmetic,
  duplicate, eligibility and trip-link checks pass.
- Added ordered itinerary legs so one trip can span several locations and
  nations. Receipt matching now considers the detected country and exact
  eligible leg, while shared border dates and multiple candidate trips remain
  explicit exceptions.
- Extended Realtime voice trip creation to collect and read back a complete
  multi-country itinerary in the user's language. The explicit spoken save gate
  remains because creating the trip is a material write.
- Extended the expense interface, protected exports, claim packages and
  audit-response DOCX reports to show original values and frozen GBP values
  together, including translation and conversion provenance. Recorded the
  design boundary in ADR 0001.

- Reduced the normal receipt-confirmation workflow to exception review. Receipt
  analysis now suggests the claim date, time, location, duty reason and a
  time-derived meal context; the owner normally supplies only an optional trip
  link or short free-text justification. The review also offers an explicit
  leave-unlinked choice so declining a trip suggestion is recorded rather than
  inferred.
- Added an immersive receipt-processing overlay with truthful staged activity,
  batch position, reduced-motion behaviour and an explicit retry path. Clean,
  high-confidence receipts can be confirmed only after an independent,
  image-only verifier and the server reconciliation, duplicate, eligibility
  and trip-link checks all pass. Required fields carrying owner provenance are
  rejected from unattended confirmation, and bounded polling prevents an
  `in_progress` analysis from leaving the interface waiting indefinitely.
- Added voice-first trip creation through a short-lived OpenAI Realtime session.
  The assistant builds and reads back a strictly validated trip draft, but the
  server saves it only after the ordered Realtime draft and readback gate has
  completed and the owner gives explicit spoken confirmation. The standard API
  key remains server-side, and the existing manual form is retained for
  privacy, permission denial and unsupported-device fallback.
- Added automatic owner-scoped trip linking when a receipt date matches exactly
  one eligible confirmed trip. An explicit owner selection is preserved, while
  overlapping candidate trips create a review exception instead of an
  arbitrary link or automatic confirmation.
- Made receipt evidence directly useful during review and audit. Confirmed
  expenses expose a private preview and original-file download, and generated
  audit-response DOCX reports include the available receipt images as well as
  the evidence register. Direct HEIC and HEIF uploads gain bounded JPEG
  sidecars for browser preview and DOCX embedding while preserving the original
  evidence unchanged.
- Replaced the fixed August claims summary with a selectable calendar month.
  Claims now separates pending receipt estimates from confirmed eligible,
  policy-eligible, claimable, blocked and over-limit amounts, making clear that
  an upload does not enter the claim calculation until it is confirmed.
- Added migration `0006_parched_prism.sql` for owner-scoped duplicate
  reservation. Atomic trip-selection and expense-insert guards prevent
  concurrent confirmation attempts from creating duplicate expenses or
  applying a stale automatic-link decision. Five-minute tokenised leases gate
  every automatic write; expired leases and stale legacy analysis states
  recover to review instead of blocking claims indefinitely.
- Bound browser-created HEIC and HEIF preview metadata to the immutable
  original receipt hash. Audit reports label these embedded derivatives as
  owner-supplied and non-authoritative, retain the original evidence details,
  and exclude a derivative when its provenance does not match.
- Added multilingual receipt evidence, exact owner-scoped ECB conversion,
  translated receipt summaries and ordered multi-country trip legs. A second
  image-only AI pass must agree before unattended confirmation. Currency and
  country exceptions have bounded owner fallbacks, and every confirmed
  conversion is recalculated against its frozen quote before ledger insertion.
- Split the international FX, conversion-integrity and exception-review code
  into focused modules, then completed independent correctness and security
  re-reviews with no release-blocking findings.
- Verified the final source with `npm test` (the production build and all 149
  tests), `npm run lint`, `npx tsc --noEmit` and `git diff --check`. All passed.
- Kept real-device acceptance open: iPhone Safari camera and HEIC processing,
  browser preview and download, reduced-motion and assistive-technology
  behaviour, Realtime microphone permissions, spoken-confirmation accuracy and
  complete receipt-to-trip end-to-end flows still require verification.
- Diagnosed a production iPhone upload that reached R2 in roughly three
  seconds but then stalled during browser-side JPEG decoding. Safari now tries
  its native image-element path before `createImageBitmap`, preparation has a
  25-second bound, and the metadata-stripping, dimension-bounded derivative is
  retained before any image reaches AI. The owner can stop waiting at batch or
  item level, and exact duplicates produce an explicit stopped message.
- Promoted Audit response to its own primary view and added month-scoped
  Statistics with spend rhythm, restaurant, food-style, meal-context and
  location analysis. The location visual uses bundled CC0 map artwork and
  country-level positions, so it does not transmit private place names to a
  geocoder or imply precise receipt coordinates.
- Verified this milestone with the production build and all 158 tests,
  `npm run lint`, `npx tsc --noEmit`, `git diff --check`, and a 390 by 844
  mobile navigation check in the local browser.
- Reworked Statistics from a basic monthly summary into an operational
  analytics workspace. It now has trip, country and meal filters, previous
  month movement, average and median spend, a tappable daily trend, daily food
  allowance heatmap, meal share, receipt-line-item food categories, currency
  analysis and chart-to-claim drill-down.
- Replaced country-only dots with an interactive MapLibre street map.
  Receipt extraction can retain venue, address, city or country coordinates
  together with the printed evidence used. Venue and address points open at
  close zoom, repeated points cluster into larger red dots, and older records
  remain visibly labelled city or country-centre estimates. OpenFreeMap
  supplies attributed OpenStreetMap-derived tiles only while Statistics is
  open; claim text and receipt images are not sent to the tile provider.
- Corrected the iPhone navigation after production feedback showed that the
  separate Statistics page was hidden inside More. Statistics now has a
  permanent bottom tab, while Audit response and Settings remain in More.
  Six touch targets retain full labels and accessible active-page state.
- Replaced the GPU-dependent MapLibre renderer after the production map failed
  on a laptop. Leaflet now renders the same close-detail, repeat-weighted dots
  without WebGL. OpenStreetMap street tiles load only for the visible viewport;
  if they are blocked or unavailable, the dots remain interactive on a local
  grid and the UI explains that the location ranking is still usable.
- Replaced the short Statistics keyword list with a controlled semantic food
  taxonomy. Future receipt analyses use merchant identity, venue type and line
  items to assign up to three food-style tags, while deterministic fallbacks
  classify recognised historic merchants immediately. This specifically
  corrects Butchies from Other food to Fried chicken without requiring a new
  upload.
- Simplified trip creation around one primary action. Create a trip now starts
  the OpenAI Realtime WebRTC speech-to-speech session immediately, the assistant
  asks aloud for each required detail, and Type instead reveals the same
  editable manual fields without losing a partial voice draft. The duplicate
  inner Start control was removed, and Recorded trips now forms a distinct
  ledger below the creation workspace.
- Added a dedicated Statistics range control for Monday-to-Sunday weeks,
  calendar months, three-calendar-month windows and calendar years. Every
  chart, map, ranking and KPI now uses the selected range, with an equivalent
  preceding-period comparison and axis labels that adapt to the time span.
- Restored the five-item iPhone bottom navigation after owner feedback that six
  destinations felt cramped. Statistics now sits with Audit response and
  Settings under More, while desktop navigation remains unchanged.
- Made Realtime trip creation lead the conversation naturally. It now opens by
  asking the owner to describe the trip, extracts all supported facts from
  their account, actively gathers only the missing details, reads the complete
  result back, and creates the trip immediately after a clear final approval
  such as “I’m happy with that”.
- Renamed the Claims navigation item to Submit and rewrote the surface around
  its actual job. Expenses remains the editable receipt ledger; Submit shows
  the month’s ready-to-claim amount, plain-language fixes and the locked
  downloadable claim package. Detailed calculation terms remain available in
  a disclosure instead of dominating the workflow.
- Added a theme-aware Leaflet layer control. Dark mode defaults to CARTO Dark
  Matter, light mode defaults to CARTO Voyager, and classic OpenStreetMap is
  retained as a third choice. The selection is stored only on the device,
  attribution changes with the layer, and interactive receipt dots continue
  to work over the local fallback when an external basemap is unavailable.
- Removed the separate Claims or Submit destination after owner feedback showed
  that it duplicated the purpose of Expenses and was easily confused with
  Audit response. Monthly claim preparation now sits in a compact expandable
  section inside Expenses. Audit response replaces Claims in the iPhone bottom
  navigation, while old `#claims` links migrate safely to Expenses.
- Simplified Expenses around three explicit jobs: review records, fix missing
  evidence and prepare a monthly package. Search and filter help now explains
  the visible result set, while the receipt ledger and package each state what
  opening them is for.
- Added a separate Policy assistant under More on iPhone and to the desktop
  rail. The owner-only route sends only a bounded chat history to OpenAI,
  searches current official GOV.UK material on every answer, rejects
  non-government citations and keeps the conversation out of D1 and R2. It
  cannot inspect or mutate claims.
- Stored the complete official JSP 752 v66.1 May 2026 PDF and a generated,
  hashed, per-page full-text corpus in the release. The policy route now ranks
  the locally stored pages for each question, supplies the strongest passages
  to the model as reference data, and still requires live GOV.UK verification.
  The UI identifies the stored source and links directly to every page used.
  Regeneration uses a hashed `pypdf` dependency and a byte-for-byte
  reproducibility check. Exact JSP source citation allowlisting and an atomic
  private daily quota protect policy integrity and AI cost.
- Fixed an interrupted mobile receipt analysis being trapped as “Reading
  receipt”. Every new AI read now has a server-side operation token, bounded
  lease and tracked current and previous analysis objects. Removal invalidates
  an expired operation before tombstoning the intake. Object keys remain in D1
  until R2 confirms deletion, then the tombstone is finalised. Late model
  results cannot overwrite or resurrect a removed receipt, and failed object
  cleanup remains discoverable and retryable. Legacy tokenless jobs retain a
  conservative recovery window.
- Fixed a clear receipt being secured but rejected before model inference. The
  strict extraction schema used an unsupported `uniqueItems` keyword, so the
  Responses API refused the request before reading the image. Receipt failures
  now remain visibly failed instead of being labelled complete, and Read again
  no longer sends blank review values through the stricter save endpoint before
  retrying the secured image.
- Shortened voice trip creation after live use showed repeated questions. Null
  placeholders can no longer erase facts already understood, the assistant
  receives the authoritative current draft after every update, infers
  unambiguous countries and combines date eligibility into one question. The
  daily-versus-aggregate choice was removed from voice and typed forms; the app
  now applies aggregation automatically to trips spanning at least three
  calendar dates. The server enforces the same rule for every client, and an
  additive migration normalises existing unlocked trips while preserving
  frozen claim-period history.
- Reduced receipt extraction reasoning from high to low after live scans
  exceeded the request deadline. The frontier receipt model remains unchanged.
  The disposable analysis derivative is now capped at 2,560 pixels and 5 MP
  while the immutable original stays untouched for evidence. Extraction retains
  original-detail vision, the independent safety verifier uses standard
  high-detail vision, and stable prompt-cache keys let repeated scans reuse
  matching shared prefixes while Responses storage remains disabled.
- Fixed a false mobile scan failure observed after the receipt had already been
  extracted and saved. The final automatic-confirmation status check now retries
  one transient server or network response failure, without uploading the
  receipt or running extraction again. The retry is deliberately bounded and
  permanent review decisions remain authoritative.
- Made exact duplicate receipt handling explicit on mobile. A receipt photo
  that is still present in the private inbox or ledger is stopped before another
  AI read and shown in a dedicated full-screen state saying it has already been
  added. The state is dismissible but not retryable. Deleting an unconfirmed
  inbox receipt continues to remove its duplicate block so it can be added
  again intentionally.
- Fixed the final receipt-to-ledger transaction after a live Pizza Pilgrims
  scan proved that upload, extraction, independent verification and trip
  matching could all succeed before confirmation returned 500. Both automatic
  and owner-confirmed expense inserts supplied 27 values for 26 columns. The
  surplus value is removed and a source-contract regression test now keeps the
  insert column and value counts aligned.
- Reworked receipt capture as a durable bounded queue so one selection can hold
  at least ten receipts without starting ten simultaneous image and AI jobs.
  The app accepts up to twenty queued receipts, runs at most two receipt
  workflows concurrently, and serialises high-resolution image preparation to
  reduce iPhone Safari memory pressure. Fresh uploads, restored drafts, retries
  and resumed server work all share the same scheduler.
- Separated immutable receipt files from mutable IndexedDB queue state. Failed
  items remain visible with an explicit retry action, terminal files are
  cleaned up, queued work can be cancelled, and reload recovery follows the
  server's authoritative intake status instead of repeating completed upload
  or extraction stages.
- Made each local file-and-state write atomic and persisted a selected batch
  sequentially, while allowing already-persisted receipts to enter the bounded
  upload scheduler immediately. This avoids a burst of IndexedDB transactions
  when ten or more photos are selected. Retry can now fall back to the secured
  analysis copy or original after the local `File` reference is released.
- Hardened the R2-to-D1 intake boundary for bulk races and partial failures.
  Discarded intakes no longer block a deliberate re-upload, ambiguous object
  writes use the same cleanup path as database commit failures, and an audit
  marker preserves cleanup responsibility if an orphaned object cannot be
  removed. An ambiguous D1 response first reconciles the exact intended intake
  before any evidence deletion. Recovery integrity checks now report orphaned
  receipt objects as unhealthy.
- Added a pre-decode JPEG/PNG dimension guard on both client and server. It
  allows 48 MP iPhone 16 photos but rejects hostile or corrupted image headers
  above 12,000 pixels per edge or 60 MP before they can exhaust Safari memory.
