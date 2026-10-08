# BONUSPLAY V2 — launch checklist

Unchecked means unverified or not implemented. A demo or passing typecheck is not production evidence.

## Phase 2 development evidence (not launch approval)
- [x] Additive V2 ledger migration applied and rerun with checksum verification
- [x] 17 isolated PostgreSQL financial tests, 4 access-policy tests and 3 demo regression tests pass
- [x] 4 frontend-cache regression tests protect immediate updates, account isolation, pagination and older-read cancellation
- [x] Required OpenAPI codegen and workspace typecheck pass
- [x] Protected 390px wallet/admin journey verified, including live cache refresh after refund, insufficient balance, replay and permission denial
- [ ] Outstanding phase-1 identity/email/production and real-administrator gates resolved

## Product
Phase-4 development evidence is documented in `V2_REWARDS.md` and `CURRENT_STATE.md`: 13 isolated redemption/inventory/refund tests and the protected 390px user/admin journey pass behind closed shared gates. This does **not** clear real-supplier fulfillment, commercial launch or the separate security/login checks below.

- [ ] Real signup, email verification, login and logout verified
- [ ] Password reset and session handling verified
- [ ] Offers and signed verified conversions work
- [ ] Ledger and balance reconciliation verified
- [ ] Concurrent/duplicate redemption and inventory tests pass
- [ ] Rewards fulfilled by real supplier
- [ ] Referral qualification and abuse tests pass
- [ ] Partner onboarding/campaign approval and scoped portal work
- [ ] Administrator/super-administrator role matrix verified
- [ ] Existing demo regression verified and clearly isolated

## Payments
- [ ] Stripe production account/keys configured securely
- [ ] Webhook endpoint and signature verification configured
- [ ] Idempotency tested
- [ ] Payment success, failure and refund tested
- [ ] Campaign funding reconciles with provider settlement

## Security
- [ ] Secret handling and logs reviewed
- [ ] Server authorization tested for every sensitive route
- [ ] Rate limiting and CSRF/cookie protections tested
- [ ] Partner webhook security tested
- [ ] Admin protection verified
- [ ] Dependency audit/security review completed

## GDPR
- [ ] Privacy policy and terms reviewed and versioned
- [ ] Cookie/optional tracking consent verified
- [ ] Marketing consent separate and recorded
- [ ] User data export works
- [ ] Deletion/anonymization and financial retention policy approved/tested

## Email
- [ ] Domain/sender verified
- [ ] Transactional email delivery tested
- [ ] Verification and reset-password email delivered
- [ ] Preferences and marketing consent enforced

## Analytics
- [ ] Privacy-conscious production analytics verified
- [ ] Conversion tracking reconciles
- [ ] Admin and partner analytics use real data

## Operations
- [ ] Reviewed migrations applied to production
- [ ] Backup/restore drill completed
- [ ] Monitoring and alert routing active
- [ ] Error tracking configured without secret leakage
- [ ] Support contact/process staffed
- [ ] Runbook reviewed

## Commercial
- [ ] Real partner approved
- [ ] Real reward supplier available
- [ ] Reward and campaign economics validated
- [ ] Liability/revenue reconciliation policy agreed
- [ ] Fraud policy and review queue operational
- [ ] Explicit commercial-launch/publish approval
