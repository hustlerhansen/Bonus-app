# BONUSPLAY

BONUSPLAY is a Norwegian Bokmål, mobile-first Progressive Web App for people aged 18+. Users complete activities, play three mini-games, earn points and experience, build a daily streak, collect event gems, and order simulated rewards.

**This release is a demo MVP, not a real-money launch.** Advertisements, surveys, offers, economics and redemptions are simulated. No external provider receives personal information, and no money, PayPal transfer or gift card is issued.

## Included

- Four-screen onboarding and signed demo user/admin sessions
- Home dashboard, ledger-derived points/gems, levels and daily streak
- Ten daily missions, five surveys and five sponsored-offer demos
- Tap Challenge (10 seconds), reaction test and matching-card Memory
- Game cooldowns, daily reward limits and idempotent reward claims
- Two events, a free weekly challenge with demo prizes, free chest animations, achievements and day/week/month demo leaderboards
- Five demo rewards, atomic redemption, pending/manual-review status and history
- Referral copy/share plus a simulated active-friend reward
- Persistent notifications, wallet filters, profile, reset and logout
- Admin overview, catalog create/edit/disable, global feature flags, users, redemption records, risk events, audit logs, analytics and unit economics
- PWA manifest/icons, production service worker and install controls
- Help, privacy and terms drafts requiring legal review

## Stack and structure

- React + TypeScript + Vite, Tailwind CSS, shadcn UI, Wouter and TanStack React Query
- Express 5 API, OpenAPI-first generated React hooks and Zod validators
- PostgreSQL + Drizzle, transaction-backed wallet and isolated browser demo accounts
- Provider interfaces: `AdProvider`, `SurveyProvider`, `OfferProvider`, `RewardProvider`

```text
artifacts/bonusplay/                 Consumer PWA and admin UI
  src/components/                   Reusable visual components and mini-games
  src/pages/                        App, admin and supporting screens
  src/hooks/                        App state, claims, tracking and metadata
  public/                           PWA manifest, icons and service worker
artifacts/api-server/src/bonusplay/  Reward engine, sessions, catalog and providers
artifacts/api-server/src/routes/    Validated API handlers
lib/api-spec/openapi.yaml           API contract
lib/api-client-react/               Generated React hooks
lib/api-zod/                        Generated validators
lib/db/src/schema/                  PostgreSQL schema
scripts/generate-pwa-icons.mjs      Reproducible PWA icon assets
```

## Run in Replit

Use the existing `artifacts/bonusplay: web` and `artifacts/api-server: API Server` workflows. The web app is served at `/`; the shared API is served at `/api`. The project gateway handles both, so browser calls are same-origin.

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Restart the two managed workflows after changing code/configuration. Open BONUSPLAY in Preview. Complete onboarding and choose the Magnar demo. The original account has **12 450 points, level 7, 1 250/1 500 experience, a 6-day streak and 135 gems**. Day 7 grants 500 points. Settings → Resett demo restores that state.

The explicit admin-demo login is on the onboarding/login screen and the protected admin screen. It issues a signed admin role for the current isolated demo account. It is intentionally available to demo visitors.

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Managed PostgreSQL connection; server only |
| `SESSION_SECRET` | Secret used to sign HttpOnly demo sessions; never exposed to clients |
| `DEMO_MODE=true` | Required to enable the demo API |
| `PORT`, `BASE_PATH` | Injected by managed artifact workflows |

Never commit secrets. Real provider keys are not required. Setting `DEMO_MODE=false` disables demo operations; it does not enable real providers.

For development outside Replit, provide the environment above and run the API with `PORT=8080` and the frontend with `PORT=22277 BASE_PATH=/`. Use a local gateway/reverse proxy that routes `/api` to the API and `/` to Vite. Do not hard-code separate service URLs in browser code.

## Database and reward engine

The schema contains users, activity catalog, reward catalog, wallet transactions, activity claims, redemptions, events, persistent achievement unlocks, notification reads, feature flags, analytics, fraud events, revenue events and audit logs.

- Points and gems are derived from ledger sums.
- The server resolves activity/reward prices from its catalog. Clients never submit awarded amounts, XP or identity.
- A locked user row serializes each reward and redemption transaction.
- A unique user/idempotency/currency constraint prevents duplicate ledger credits or debits.
- Claim idempotency keys are reused on retries; daily streak claims use a deterministic calendar-day key.
- Redemption balances are checked while locked; insufficient balances cannot create an order.
- Activity limits reset by calendar day in **Europe/Oslo**. Games have three rewarded sessions per day per game and a short cooldown.
- Provider event IDs are unique. Unverified completions or unsupported reward budgets roll back all credits; economics include level-up point bonuses.
- All data modifications are parameterized. Catalog disablement retains history instead of deleting references.
- Schema changes are development migrations; API startup only seeds missing demo rows.

Each browser demo account is isolated. Seeded leaderboard accounts and simulated economy metrics are labelled demo. Admin catalog/feature configuration is global to the demo application.

## Unit economics

Monetized activity events record gross revenue, provider cost, user reward cost and gross contribution in integer øre. Demo economics allocate a controlled proportion of simulated revenue to rewards. The admin displays demo aggregates, per-user metrics, actual demo liability, and recorded activity-level economics. New reward catalog entries must cost at least 100 points per NOK of nominal demo value.

Before real rewards, replace simulated revenue with verified provider settlements and enforce a configurable reward budget. Never treat the seeded demo totals as actual business revenue.

## Security and anti-fraud boundary

Signed, expiring HttpOnly cookies protect demo role separation. Reward routes validate input, reject cross-site mutations, rate-limit requests, enforce feature flags, use idempotency and daily limits, and record audit/velocity events. Riskier redemptions receive `MANUAL_REVIEW`. No invasive fingerprinting is used.

**Public admin-demo enrollment is not suitable for a commercial launch.** Replace it with managed Clerk/Replit authentication and server-controlled admin membership. Demo mini-game scores and mock completion are not proof suitable for monetary payouts; real providers must send authenticated, deduplicated completion events, and game rewards need server-issued sessions/proof.

The service worker does not cache API responses or wallet/account data. API responses use `Cache-Control: no-store`.

## Integrating providers later

Implement the interfaces in `providers.ts`, keeping the wallet/reward engine independent. Real integrations must:

1. Verify signed provider callbacks/server-to-server postbacks.
2. Store unique provider event IDs and reject duplicate callbacks.
3. Resolve identity and approved rewards server-side.
4. Record actual revenue/provider cost and enforce economic limits before crediting.
5. Queue real reward delivery with explicit pending/failed/fulfilled statuses and reconciliation.

Do not merely swap a mock class and enable cashouts. Real authentication, provider proofs, legal/compliance review, age/consent flows, data export/deletion, reconciliation and monitoring are launch prerequisites.

## Publishing the demo

The registered artifacts already include production build/serve definitions: Vite produces the static frontend, and the API uses the built Express server. Publish the **project** with both services and the required environment/secrets. Keep demo labels and `DEMO_MODE=true`. This produces a demo application at a public URL, not a commercial rewards service.

Review privacy/terms/help drafts and replace them with reviewed policies before commercial use. The app is online-first: the PWA shell can be cached, but reward operations require the API.

## Validation

`pnpm run typecheck` is the full static check. The initial API verification covers demo login, original state, streak credit and duplicate rejection, idempotent activity rewards, redemption debit, admin authorization and reset. Browser journey and provider-security regression suites should be added before any real-money rollout.
