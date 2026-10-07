# BONUSPLAY V2 — safe implementation plan

Source: the user's V2 master specification. Preserve the existing Norwegian identity, working functionality, demo data and film. Implement a modular monolith, not a rewrite.

## Rollout boundaries

- Existing `/api/bonusplay/*` and consumer demo remain explicitly demo.
- V2 APIs use `/api/v2/*`; V2 landing/account pages are added without silently converting seeded demo users.
- Managed email/password authentication; server-owned persisted roles. No public administrator enrollment or first-user-admin shortcut.
- Additive SQL migrations, transactionally applied to development with a migration ledger; no production DDL in application startup. Financial values never come from the browser.
- Real rewards, Stripe funding and commercial launch are separate gates. A foundation account is not a working earn/redeem marketplace.
- Replit records project checkpoints automatically. In addition, preserve a code-only Git baseline before implementation. A Git reference is **not** a database backup; do not claim it is.

## Phases and exit gates

| Phase | Deliverable | Verification / exit gate |
|---|---|---|
| 0 — audit | `CURRENT_STATE.md`, this plan, launch checklist/runbook | Source/schema/environment review, running health, workspace typecheck; preserve baseline |
| 1 — foundation | Managed registration/login/logout/verification/reset, persistent clean profiles, consent-version records, server-side roles, additive identity migration, account navigation | Anonymous access denied; demo cookie cannot authorize V2; signup never grants roles; profile persistence, verified identity, legal acceptance; browser auth check and regression smoke |
| 2 — points | Append-only V2 ledger, pending/approved/reversed transactions, atomic balances, audited admin adjustments | Duplicate award, replay, insufficient balance, parallel debit, reversal and authorization tests |
| 3 — earn | Marketplace/detail/start flow, clicks, approved offers, signed partner callbacks and conversion lifecycle | Signed callback validation, deduplication, review before reward; no simulated credits |
| 4 — rewards | Store/detail/history, delivery queue, inventory and risk checks | Atomic inventory/balance reservation; duplicate/concurrent redemption; failed delivery/refund reconciliation |
| 5 — referrals | Unique codes/links, first-verified-offer qualification, admin-configurable reward, abuse checks | No reward on signup; self-referral/duplicate/cyclic qualification tests |
| 6 — partner | Company onboarding, approval, scoped campaign CRUD, campaign review and analytics | Partner cannot read another company's data or change balances; no live campaign before approval |
| 7 — billing | Stripe campaign funding, signed idempotent webhooks, invoices/refunds | Sandbox success/failure/refund; frontend cannot activate funding; production keys and endpoint separately verified |
| 8 — admin | Scoped admin sections, fraud review, immutable audit, approvals, economics/settings | Role matrix, before/after audit, financial adjustment reason/actor, no destructive balance edit |
| 9 — compliance | Reviewed legal text, cookie/marketing consent, export, deletion/anonymization requests | No optional tracker before consent; retained financial records handled by approved policy |
| 10 — communication | Email templates/provider, notification center, support tickets | Delivery tests; consent-aware marketing; owner-scoped tickets and read state |
| 11 — hardening | Critical financial integration suite, monitoring, rate limits, query/pagination/performance work, restore drill | Full user/partner/admin journeys, concurrency tests, dependency/security audits, no high-priority unresolved finding |
| 12 — launch | Production migrations/configuration and commercial readiness | All launch checkboxes verified; explicit user publish approval; real partner/reward and valid unit economics |

## Per-phase procedure

Review the previous phase, implement frontend/backend/storage/validation/authorization together, run relevant tests, fix regressions, update these documents, and retain a recoverable boundary before continuing. An unchecked launch gate remains unchecked even if the screen exists.

## Admin provisioning

Roles are database-controlled and never copied from browser requests, demo cookies or user-editable identity metadata. Initial SUPER_ADMIN requires an operator-controlled, reviewed provisioning action for a verified account. No hardcoded email/credentials, no first registered account promotion. Keep admin routes closed until this action is performed.

## Outstanding external dependencies

Real partner contracts, approved reward suppliers, Stripe account, legal policies, retention schedule, support contacts, and commercial economics require business decisions/configuration. Do not invent partners, customers, revenue, policies or production credentials.

## Progress and evidence

- Phase 0: completed in development. Audit/plan/checklist/runbook created; code baseline preserved with a Git tag before foundation edits. This is not a separately verified database backup.
- Phase 1: implemented in development. Identity tables, enrollment, roles, profile, auth routes, legal-version acceptance and security boundaries added. Static/unit/API checks pass; focused browser flow passed except a security default-tab issue corrected afterward.
- Remaining Phase 1 gates: real verification/reset email delivery, production environment/domain settings, password/session mutation checks, and explicit administrator/operator selection. No credentials or real administrator identity were invented.
- Phases 2–12: pending. Financial ledger for V2, offers/conversions, rewards, referrals, partners, Stripe, full admin, compliance/export/deletion, communications, hardening and commercial launch remain deferred in the specified order.
- Security scans/follow-up findings: `SECURITY_AUDIT.md`. Critical dependency finding patched; remaining high/moderate issues prevent a launch-readiness claim.
