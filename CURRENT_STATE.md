# BONUSPLAY — current-state audit

Audit date: 2026-10-07. Scope: repository and running development app; no production database mutations. This is a baseline, not a commercial-launch certification.

## Stack and architecture

pnpm/TypeScript modular monorepo. React 19/Vite, Wouter, React Query, Tailwind/shadcn; Express 5/Pino; PostgreSQL/Drizzle; OpenAPI/Orval generated clients and validators. Same-origin gateway serves the consumer web app at `/` and API at `/api`. Existing film and component sandbox are independent artifacts and are out of V2 application scope.

## Database

Development schema inspected via PostgreSQL metadata: `users`, `activities`, `activity_claims`, `wallet_transactions`, `rewards`, `redemptions`, `events`, `user_achievements`, `notification_reads`, `feature_flags`, `analytics_events`, `fraud_events`, `revenue_events`, `audit_logs`.

Demo users have seeded progress and balances. Ledger amounts are integers; balances come from sums, not a browser-owned number. Claims and redemptions lock the user row in a database transaction. User/idempotency/currency uniqueness and provider-event uniqueness exist. Catalog/history are retained when items are disabled. Current ledger status model is demo-oriented, not the V2 pending/approved/reversed lifecycle.

No real partners, campaigns, authenticated account profiles, payment settlement, fulfillment codes, consent history or support tickets exist. No demo rows will be relabeled as real accounts.

## Authentication and authorization

Signed, expiring HttpOnly demo cookies; HTTPS preview cookies are partitioned. Session secret is server-only. Explicit public admin-demo enrollment is intentional for demo presentation and **must never authorize V2 operations**. There is no email/password registration, email verification, reset-password flow, or production role membership yet.

V2 will use managed Clerk for authentication and a separate database profile for server-owned `USER`, `PARTNER`, `ADMIN`, `SUPER_ADMIN` roles. Passwords will not be handled by BONUSPLAY. A demo cookie is not a V2 identity.

## Existing routes and API

Web: `/`, `/missions`, `/games`, `/events`, `/leaderboard`, `/rewards`, `/wallet`, `/profile`, `/achievements`, `/referrals`, `/notifications`, `/settings`, `/admin`, `/help`, `/privacy`, `/terms`.

Existing reusable UI: shell, button/card/logo primitives, reward modal/provider, error boundary, protected/demo onboarding, shadcn controls and three mini-games.

API: `/api/healthz`; `/api/bonusplay/demo-session`, `logout`, `state`, `claims`, `daily-reward`, `redemptions`, `reset`, `features/:key`, `missions/:id`, `admin`, `admin/catalog`, `admin/catalog/:id`, `notifications/read`, `analytics`. Catalog is supplied through authenticated state/admin responses; `/api/bonusplay/catalog` is not an endpoint.

## Working functionality and verification baseline

- All workspace typechecks pass.
- Running development health endpoint returns HTTP 200.
- Existing account state, activity, daily bonus, redemption and demo-admin handlers have server validation and persisted transactional implementations.
- Demo economy, notifications, games, events, catalog administration and seeded leaderboards are explicitly simulations.
- Previous video audio/playback fix is unrelated and will be preserved.

Source review does not substitute for an end-to-end test. Registration, live offers, live payments and reward delivery cannot be marked working because they do not exist. No comprehensive automated financial regression suite exists at this baseline.

## Security risks / launch blockers

1. Public admin-demo enrollment is unsuitable for commercial authorization.
2. Mock providers/client game scores are not evidence for real-money rewards.
3. Current CORS configuration is unrestricted; CSRF guard relies mainly on fetch metadata.
4. In-memory request limiting is per process, not a distributed production limit.
5. V2 needs approval workflows, inventory locks, verified callbacks, refund/reversal accounting and settlement reconciliation.
6. Privacy/terms are drafts; no production legal review or financial retention policy.
7. No real fulfillment, domain-verified email provider, monitoring, restore drill or production financial test evidence.
8. Audit logging exists but lacks the full V2 actor/before/after model and database append-only protections.

## Environment / integrations / deployment

Presence checked without reading secrets: managed `DATABASE_URL` and `SESSION_SECRET` exist; `DEMO_MODE=true`. Clerk is not configured at baseline. Stripe and Resend credentials are absent. Workflow-managed `PORT`/`BASE_PATH` must remain intact. No third-party business integrations currently connected.

The public published app is the existing demo, not V2. Development edits are not automatically commercial launch approval. Production schema changes must use reviewed, versioned migrations; no startup DDL or manual production mutation.

## Preservation strategy

Keep the existing demo, its records and current routes working. Add V2 identity tables and routes incrementally. New accounts receive no demo balances, awards or admin roles. Keep the live commercial system closed until the launch checklist is verified. Record concrete verification and remaining gaps after each phase.

## Phase 1 development result

Managed Clerk authentication is now configured in development. Additive V2 identity/consent/audit migration applied and rerun successfully without altering demo tables. Database-controlled role policy, verified-email enrollment, immutable consent/audit history, profile editing, API headers/CSRF/rate limits and operator-only development role provisioning added. No account was automatically promoted.

New screens: `/v2`, `/business`, `/sign-in`, `/sign-up`, `/account`, `/account/profile`, `/account/security`. Existing demo root/routes remain. All new screens clearly label the commercial marketplace as inactive.

Verified: workspace typechecks; four role/CSRF policy tests; three live development demo regression tests covering duplicate credit, parallel/duplicate redemption, insufficient balance and cross-scope authorization; mobile V2 landing screenshot; browser verified enrollment/profile persistence/logout, regular-user permission denial, role-field injection rejection, duplicate enrollment and preserved demo balance/game/wallet navigation.

Browser review found that the security page initially opened Clerk's profile tab. Entry navigation was corrected to the security sub-route that the browser review had already verified contains password/session controls. The navigation fix is confirmed by source/typecheck, not a second complete browser pass.

Unverified at the phase-1 checkpoint: actual signup/verification email delivery, forgot/reset-password delivery, OAuth, password/session mutations, production Clerk configuration and any live financial journey. The helper-created browser test identity does **not** prove email delivery. Phase 1 retains these external verification gates; see the phase-2 update below.

## Phase 2 development result

V2 now has a real, separate append-only points ledger. Transactions, lifecycle events and request keys are immutable; all eight types and four statuses are supported. Account-row locks serialize writes/reservations, and the audit trail retains authenticated actor, reason and before/after state. Refund/reversal amounts are server-derived, linked to their original, and cannot duplicate or overdraw.

New screens: `/account/points` (own balance/history) and `/account/points/admin` (role-protected account lookup, adjustments, decisions and full compensations). History is keyset-paginated and includes lifecycle events. New-user balances start at zero, not demo values.

Verified in development: additive `0002_v2_points.sql` applied and rerun without changes; required OpenAPI codegen; full workspace typecheck; 17 PostgreSQL integration tests; 4 role/CSRF tests; 3 existing demo financial smoke tests including all V2 points routes denied to demo sessions; 4 frontend-cache regression tests (immediate committed results, account isolation, pagination and cancellation of stale reads); health 200 and anonymous wallet 401; public mobile V2 screenshot without rendering errors. See `V2_POINTS.md` for accounting semantics and limitations.

Protected-browser verification passed at 390px: own zero wallet/history, USER admin denial, audited +100 adjustment, insufficient -150 rejected with Norwegian 409 message, -30 debit, full refund, credit reversal, reload persistence, strict field-injection rejection, idempotent replay/conflict and 22-row previous/next paging without duplicates. A stale post-refund UI found in the first pass was corrected with committed-response cache updates, cancellation of older reads and awaited refetch; a focused follow-up confirmed wallet, compensation row and reversed original update without reload. One transient gateway 502 during the first pass did not recur with the server stable.

Only a clearly synthetic development identity was temporarily given ADMIN for this verification; it was reverted to USER and subsequent admin API access returned 403. Its immutable test history is retained, not represented as real customer activity. No real administrator was selected or automatically enrolled. No production schema, Stripe/payment, offer, reward delivery, referral qualification or partner workflow was activated. Phase-1 external checks remain separate launch/phase-3 gates.

## Phase 3 — offers prepared, activation closed

The additive offer migration and regenerated OpenAPI clients/validators are in development. Approved immutable offers include requirements, terms, completion steps, timing, optional expiration and server-owned BP. Mobile account routes cover offer list/detail/start confirmation, own conversion history, draft creation and administrator review. Click attribution is server-owned; click alone never earns points. Raw-byte HMAC partner callbacks require timestamp, fresh nonce and unique partner event/click identity. Partner evidence and administrator approval are separate, with pending/verified/rejected lifecycle and atomic shared ledger/conversion transactions. The integration actor must be an explicit active stored database administrator; no synthetic system role, demo provider or browser amount is accepted.

Verification: workspace typecheck passed; 21 isolated PostgreSQL offer tests, 17 points integration tests, 4 access-policy tests, 3 demo financial smoke tests and 4 frontend cache tests passed. Tests cover signature tampering/time, nonce replay, event/click deduplication, scope, RBAC, immutable economics, live database actor checks, review bypass prevention, concurrent decisions, rollback and expiry. The initial demo smoke encountered 502 while the managed API service was not yet running; all three passed after the planned service restart. API/web workflow startup logs were clean; unauthenticated offers and unknown partner callbacks both returned 401.

Protected browser verification at 390×844 passed for creating a synthetic draft, reading its full review details, approving it, reload persistence, USER admin denial (403), own list/detail, disabled start/external acknowledgment, and zero wallet/click/conversion counts. The test used the approved Clerk helper, not email delivery verification. One non-blocking expected 401 from anonymous demo onboarding and the normal development-key warning were observed. The public V2 mobile landing screenshot also rendered correctly.

Final browser-test state: only a synthetic account was temporarily ADMIN and then restored to USER; its synthetic partner was deactivated. Immutable synthetic offer/audit evidence remains, not customer activity. No callback secret or real partner/operator was provisioned. The shared gate remains `phase1_cleared=false`, `earn_enabled=false`. No live points earning, payouts, Stripe or production schema changes were activated. See `V2_OFFERS.md` for protocol, rollout, access and operational constraints.

## Phase 4 — rewards prepared, security/commercial gates closed

Implemented the V2 reward catalogue/detail/redemption confirmation, own order history, administrator draft/review screens, manual delivery queue and read-only reward reconciliation. Definitions require an operator-configured approved supplier and actual SKU/approval reference; there are no seeded suppliers or rewards. Prices and immutable terms are server-controlled. Pending REDEEM reservation, stock, order, replay record and audit share one PostgreSQL transaction. Dispatch consumes the reservation once; uncertain delivery retains the debit until evidenced delivery or confirmed non-delivery/full refund. Generic points administration cannot bypass reward settlement. Suspended recipients and later-closed gates do not prevent administrator-authorized cleanup.

Verification on 2026-10-08: 13 isolated PostgreSQL reward tests, 50 points/reconciliation test cases, 30 offer tests (including approved-credit reversal), 4 access-policy tests, 3 demo financial tests and 4 frontend cache tests pass. The reward suite also verifies the existing points reconciler accepts the combined order/refund history. Workspace typecheck passed; OpenAPI regenerated, including after integrating the offer-reversal changes. Development migrations were applied and rerun with matching checksums. Demo smoke initially returned 502 while the API workflow was not running; all three passed after its planned restart. Health is 200 and anonymous reward/admin queue requests are 401.

One protected browser pass at 390×844 verified the Norwegian admin-to-user-to-admin financial journey using two independent synthetic Clerk sessions and an isolated PostgreSQL schema. It covered normal enrollment, immutable draft creation/review/reload, USER admin denial (screen plus 403), closed-gate detail/disabled controls, server price/terms confirmation, redemption and reload-persistent own history, reservation/stock values (100 balance, 40 reserved, 60 available; stock 2→1), dispatch, uncertain delivery, explicit evidenced non-delivery/refund, refreshed user history/wallet (100 available, zero reserved), stock restoration to 2 and clean admin reconciliation. Screenshots were inspected. Navigation/tab rows scroll horizontally on narrow mobile screens; content remains usable. Only the normal Clerk development-key warning was observed.

All browser suppliers/rewards/points/roles and opened test gates were confined to the isolated schema. The managed API workflow was restored without its temporary PGOPTIONS override before the test schema and temporary files were removed. Subsequent shared-database checks confirm `phase1_cleared=false`, `earn_enabled=false`, `v2_redeem_gate.enabled=false`, and zero V2 reward suppliers, definitions and orders. The restored workflow starts cleanly and health is 200.

No live reward fulfillment, money, Stripe, production migration or publish was authorized by this phase. Actual supplier agreements, approved economics and the separately outstanding security/login gates remain prerequisites. See `V2_REWARDS.md` and the reward section in `RUNBOOK.md`.

## MVP-herding 2026-10-09 (utvikling, ikke lansert)

Bygget etter eierens rammer i `IMPLEMENTATION_PLAN.md`. Alle porter er fortsatt lukket, og ingen produksjonsmigrering eller publisering er utført.

- **Sikkerhet:** Godkjenningskø for høyrisikohandlinger med ventetid ≥ 60 min, egen bekreftelse med ny MFA, utføres maks én gang og valgfritt krav om to administratorer. Administratorer kan aldri behandle egen fordel. MFA kreves på alle `/v2/admin/*`, og all admintilgang logges. `drizzle-kit push` er erstattet av migrasjoner. CI er satt opp.
- **Økonomi:** 100 BP = 1 kr, 30 % standard brukerandel, maks 40 %, minstemargin 50 % (versjonert og kan bare endres via køen). Kampanjepoeng beregnes av serveren med lønnsomhetskontroll før aktivering. All opptjening krever finansiering (verifisert konvertering eller godkjent markedsbudsjett), håndhevet i databasen. Kampanjetak. Premier prises til pålydende. XP, nivåer, streak og merker er adskilt fra poengboken.
- **Gavekort:** Manuell levering. Koden lagres kryptert (AES-256-GCM, `V2_VOUCHER_KEY`) og vises bare for eier, med logg. Innløsningsregler: kontoalder, verifisert opptjening og dagsgrenser. Dyre ordre går via køen. Adapter for senere automatikk finnes, men databasen tillater bare `manual`.
- **Demo:** Flyttet til `/demo`. Privat for testere på en liste (administreres i admin-hub). Banner «TESTVERSJON». Ingen offentlig demo-admin. Demodata har ingen vei til V2.
- **Brukeropplevelse:** Ny forside (`/`), nytt hjem (`/account`) med saldo, nivå, streak, merker, anbefalte tilbud, neste mål og siste aktivitet. Admin-hub (`/account/admin`). Dataeksport og sletteforespørsel under Profil.
- **Verifisert:** typekontroll, 134 automatiske tester (`test:v2`, `-points`, `-offers`, `-rewards`, `-admin`, `-economy`, `-fulfillment`, `-privacy`, `test:v2-cache`), byggene for web og API, og en HTTP-røyktest mot nymigrert database (anonym tilgang avvises, demo krever tester, ukjent partner avvises, admintilgang logges). Ingen nettlesertest med ekte Clerk-innlogging i denne økten.
