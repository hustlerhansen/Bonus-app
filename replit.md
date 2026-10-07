# BONUSPLAY

Norwegian Bokmål, mobile-first rewards and mini-games PWA for adults, with demo-only providers and monetary rewards.

## Run & Operate
- Web workflow: `artifacts/bonusplay: web`
- API workflow: `artifacts/api-server: API Server`
- `pnpm run typecheck` — all shared libraries and apps
- `pnpm --filter @workspace/db run push` — development schema
- `pnpm --filter @workspace/api-spec run codegen` — regenerate contract types
- Required environment: managed `DATABASE_URL`, secret `SESSION_SECRET`, `DEMO_MODE=true`

## Project map
- `artifacts/bonusplay`: React, Wouter, Tailwind, shadcn, React Query PWA at `/`
- `artifacts/api-server/src/bonusplay`: catalog seed, signed demo session, wallet/reward engine, providers, admin catalog
- `artifacts/api-server/src/routes/bonusplay.ts`: validated API at `/api/bonusplay`
- `lib/api-spec/openapi.yaml`: source of truth for API contracts
- `lib/db/src/schema`: PostgreSQL/Drizzle schema
- `README.md`: architecture, operation, security boundaries and launch prerequisites

## Product rules
- All consumer copy is Norwegian Bokmål, market Norway, currency NOK, audience 18+.
- All external providers, monetary figures and redemptions remain explicitly DEMO. No real money or gift cards are sent.
- Never sell random chests for real money.
- Rewards must never exceed what verified unit economics can support.
- Do not replace demo providers with live providers or authentication without an explicit new request.

## Architecture
- Each signed browser demo session gets an isolated Magnar profile; public demo admin enrollment is intentional and is not production authorization.
- Wallet balances are sums of ledger entries, never client-owned mutable balances.
- Claims and redemptions lock the user row and write ledger/state in one transaction. Reward values and daily limits are server-owned.
- Catalog disablement preserves historical ledger references. Admin changes are audited.
- Database schema is applied in development, not via startup DDL. Startup seed only inserts missing demo catalog rows.
- API changes require codegen; do not edit generated clients or validation schemas.
