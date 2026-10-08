# BONUSPLAY V2 — operational runbook

Status: draft, before commercial launch. Existing published product is a demo.

## Environments and releases

Tilbud/konverteringer har egen lukket port og signert callbackgrense. Se `V2_OFFERS.md` for protokoll, betrodd aktør, operatørkonfigurasjon og hendelsesstans. Ikke klarer tidligere sikkerhets-/innloggingsporter som en sideeffekt av å levere tilbudskode.

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

### Read-only points reconciliation and scheduled alerts

The API runs a full V2 ledger check on startup and every 15 minutes while the API process is running. No separate worker, migration, public endpoint or correction job is installed. A PostgreSQL transaction-scoped advisory lock prevents overlapping scheduled scans across API replicas; a busy replica logs `POINTS_RECONCILIATION_SKIPPED`. Every completed scan uses one **REPEATABLE READ, READ ONLY** snapshot of transactions, events, requests and points audits. Each SQL statement has a 60-second timeout. Failed scans are not healthy scans.

For an operator report against the database already configured for the current environment:

```sh
pnpm --silent --filter @workspace/api-server run points:reconcile
# Optional local JSON file (do not commit operational reports):
pnpm --silent --filter @workspace/api-server run points:reconcile > /tmp/points-report.json
```

Exit codes: **0** = no detected discrepancies, **2** = discrepancies requiring operator review, **1** = report unavailable (including missing schema, connection or build failures). Read the exit code immediately; do not interpret an empty/failed report as success. This command never applies migrations or changes ledger data. It uses the configured database; do not switch it to production without an approved operational procedure.

Report contract (illustrative empty report; `checkedAt` is the snapshot time):

```json
{
  "version": 1,
  "checkedAt": "2026-10-07T12:00:00.000Z",
  "status": "ok",
  "requiresOperatorReview": false,
  "counts": { "transactions": 0, "events": 0, "audits": 0, "requests": 0 },
  "findings": []
}
```

A discrepancy sets `status: "drift"` and includes findings with `code`, `accountRef`, `transactionRef` and, when relevant, `eventRef`/`auditRef`. Account references are `account-sha256:<full SHA-256 of internal account ID>`; transaction/audit references are UUIDs, with a hashed fallback for non-UUID references. Event references are sequence numbers. An orphan may have no resolvable account. **No names, email addresses, raw identity IDs, source references, request keys, reasons, descriptions or database error details are logged or exported.** References remain operationally sensitive: restrict log/report access and retention. To correlate a known internal account ID, an authorized operator can compute its reference locally without searching by personal data:

```sh
node -e 'const c=require("node:crypto"); console.log("account-sha256:"+c.createHash("sha256").update(process.argv[1]).digest("hex"))' '<internal-account-id>'
```

| Finding codes | Operator interpretation |
|---|---|
| `MISSING_EVENT`, `ORPHAN_EVENT`, `INVALID_LIFECYCLE` | Missing transaction history or illegal transition; review the referenced event chain. |
| `EVENT_EFFECT_MISMATCH`, `TRANSACTION_TOTAL_MISMATCH` | Approved deltas or reservation creation/release do not match the transaction and lifecycle. |
| `ACCOUNT_BALANCE_INVARIANT` | Running balance, reserved or available points became negative or exceeded safe integer arithmetic. |
| `DUPLICATE_COMPENSATION`, `COMPENSATION_LINK_MISMATCH`, `INVALID_COMPENSATION` | More than one compensation, missing reversal/link, wrong account/amount, nested compensation or invalid refund. Review original and compensation references together. |
| `DUPLICATE_ORIGIN`, `DUPLICATE_REQUEST` | A source/reference pair or global idempotency key was reused; each affected transaction is reported without exporting the keys. |
| `EVENT_WITHOUT_AUDIT`, `EVENT_MULTIPLE_AUDITS`, `AUDIT_WITHOUT_EVENT`, `ORPHAN_AUDIT` | Event/audit coverage is not one-to-one. A compensation audit must cover both the original reversal event and its own approved event. |
| `AUDIT_ACTION_MISMATCH`, `AUDIT_ENTITY_MISMATCH`, `AUDIT_ACTOR_MISMATCH`, `AUDIT_REQUEST_MISMATCH`, `REQUEST_AUDIT_CARDINALITY`, `ORPHAN_REQUEST` | Audit action/entity/actor/account/request linkage is inconsistent or absent. |
| `AUDIT_BALANCE_MISMATCH` | Before/after balance, reserved or available values disagree with independently reconstructed event totals, including both sides of compensation. |

Scheduled checks produce structured log signals:
- `POINTS_RECONCILIATION_OK` (info): successful check, snapshot timestamp and row counts.
- `POINTS_RECONCILIATION_DRIFT` (error): timestamp, counts and finding count, followed by `POINTS_RECONCILIATION_FINDINGS` batches of at most 100 references.
- `POINTS_RECONCILIATION_FAILED` (error): check unavailable, requiring investigation. Error content is deliberately omitted to prevent credential/PII disclosure.
- `POINTS_RECONCILIATION_SKIPPED` (info): another replica holds the scheduled scan lock.

These are **log-based alerts**, not email/SMS delivery. Before commercial launch, connect error codes to the approved operational alert receiver and arrange an independent dead-man alert if no successful scan is seen for 30 minutes. The in-process schedule cannot detect its own stopped service; it is not evidence of external monitoring or on-call delivery. Unresolved drift is signalled again on later scans; there is no automatic acknowledgement or suppression.

Response procedure:
1. Preserve the report timestamp and technical references in the restricted incident record. Rerun the read-only report to confirm current state; never try to silence it by changing historical rows.
2. Review the affected account/transaction event chains, compensation links and audit/request linkage using authorized access. Several findings may describe one underlying defect.
3. Stop affected financial operations through the approved operational controls if integrity is uncertain; this detector does not suspend users, change roles or automatically disable earning/redemption.
4. Investigate failed checks through database availability, applied migration versions and server resource limits without copying connection strings or raw SQL errors into logs.
5. Any correction needs explicit operator approval and an independently justified, audited adjustment/refund/reversal through the existing engine. Never update/delete financial history, disable append-only triggers, or change constraints to make the report pass.
6. Run `test:v2-points` before reopening and retain the follow-up clean report. A clean report covers these invariants only, not external settlement or partner economics.

Current scale boundary: the detector reads the full ledger into process memory and scans it in event-sequence order. Measure execution time/memory before substantial volume; do not silently truncate a scan or present a partial check as healthy. Fault tests use in-memory copies of an isolated PostgreSQL ledger, so real history, financial constraints and triggers remain unchanged.

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
