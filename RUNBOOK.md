# BONUSPLAY V2 — operational runbook

Status: draft, before commercial launch. Existing published product is a demo.

## Environments and releases

Development is not production. Use managed workflows for web/API. Never print secrets or put them in documentation. Apply versioned additive migrations in development, review them, then use the publishing/database workflow for production; never run startup DDL. Do not publish during implementation without the user's approval.

Before a release: record current schema/migration version, ensure a database backup exists, run tests, review launch gates and arrange monitoring. Code-only Git baselines do not back up PostgreSQL. Use the project's recovery/checkpoint controls for supported recovery; confirm the target and data impact before restoring.

## Backup and restore strategy

Use the managed PostgreSQL backup/checkpoint mechanisms and confirm retention/access with official platform documentation at launch. Required evidence: a recent recoverable backup and a successful isolated restore drill. These are not yet verified. Never include connection strings or personal data exports in the repository.

## Payment/Stripe incident

Stop campaign activation and new funding-dependent awards. Preserve signed webhook payload references/IDs, not secrets. Retry idempotently; reconcile provider payments against local records. Never manually mark payments successful from browser state.

## Email incident

Pause marketing delivery, preserve transactional jobs and retry with bounded backoff. Do not bypass email verification. Display actionable delivery/retry status and alert the operator. Verify sender/domain/provider status.

## Points bug

Disable earning/redemption with feature flags, preserve all ledger history and affected conversion IDs. Reconcile per account and settlement; correct through audited adjustment/reversal/refund entries, never editing/deleting historical financial events. Run duplicate/concurrency regression tests before reopening.

### V2 phase-2 points operations

See `V2_POINTS.md` for balance formulas, transitions and endpoints. Use `/account/points/admin` only with an operator-provisioned ADMIN/SUPER_ADMIN account. Every adjustment/decision/refund/reversal needs a 10–500-character reason and is audited with actor and before/after balances. Full compensation derives the amount from the original on the server; partial refunds are not enabled.

If a request times out, retry the unchanged intent with the same idempotency key. The server returns the same transaction ID with current state. A changed intent with an already-used key is a 409, not permission to silently alter the previous entry. Do not switch keys just to bypass an insufficient-balance error or invalid transition.

V2 schema changes use `pnpm --filter @workspace/db run migrate:dev`, never schema push: the versioned SQL contains append-only triggers and CHECK constraints. It is development-only and not run at application startup. Production remains a separately approved migration/release gate. Regression command: `pnpm --filter @workspace/api-server run test:v2-points`; tests isolate and remove their own PostgreSQL schema.

## Fraud attack

Rate-limit abusive entry points, review suspicious accounts/transactions, hold high-risk redemptions. Do not ban on IP alone. Record reviewed decisions and minimize retained signals. Require explicit approval before any bulk destructive action.

## Migration failure

Keep old code/data compatible, stop the release, inspect transaction/migration-ledger status, and test a forward fix in development. Do not use destructive schema push or delete records to make migrations pass. Restore only after confirming backup and data-loss implications.

## Deployment failure

Inspect managed workflow/build/production logs; verify required variable existence without reading secret values. Keep last working release available. Roll back using project checkpoints only with explicit user/operator selection. Re-run health and critical journeys after recovery.

## Access recovery

V2 administrators are never self-enrolled from the public UI. Provision/recover roles through a reviewed operator action for verified accounts; record the reason and audit trail. Demo admin sessions must never grant V2 permissions.

Development-only operator procedure, after the selected person has enrolled and verified their account:

```sh
cd lib/db
node provision-v2-role.mjs --development --confirm \
  --account <Clerk-user-ID> --role SUPER_ADMIN \
  --operator <operator-reference> --reason "Approved development administrator"
```

Run only with the development database environment. No account has been promoted automatically. Production provisioning requires its own reviewed operator release procedure. This command is not a public API and does not activate partner companies or campaigns.
