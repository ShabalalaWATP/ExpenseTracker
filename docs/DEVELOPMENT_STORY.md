# Development Story

This document records meaningful implementation milestones, decisions and verification work for future maintainers. Entries are chronological and focus on why each change matters.

## 28 July 2026

- Established ExpenseTracker as a private OpenAI Sites application using Vinext, keeping access and personal expense evidence within the intended private site boundary.
- Built an iPhone-first responsive interface for capturing receipts, reviewing daily allowance, managing trips and expenses, preparing claims, and inspecting settings. Desktop layouts remain supported without displacing the mobile workflow.
- Added Cloudflare D1 persistence for trips, expenses and prepared claims, with R2 storage for receipt evidence. Receipt responses are explicitly private and non-cacheable.
- Implemented UK Day Subsistence calculations for JSP 752 v66.1. The policy applies a £30 daily cap, claims qualifying actual spend, excludes separately identified gratuities, requires receipt and eligibility evidence, and permits aggregation only for trips of at least two nights.
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
