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
