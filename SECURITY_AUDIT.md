# BONUSPLAY V2 — foundation security review

2026-10-07. Scope: development foundation and dependency/static/privacy scans. Not a penetration test or launch approval.

## Checks performed

- Three scans completed: dependency audit, static code scan and privacy/dataflow scan.
- Initial dependency audit: 1 critical, 4 high, 3 moderate.
- Fixed critical `proxy-addr` advisory through a compatible patch override to 2.0.8. Follow-up dependency audit confirms **0 critical, 4 high, 3 moderate**.
- Clerk peer requirements satisfied by React/React DOM patch update 19.1.0 → 19.1.4.
- V2 authentication is provider-verified. Enrollment reads the primary verified email server-side.
- V2 roles are local database membership, not public/user-editable metadata or demo session roles.
- Enrollment and profile writes are transactions with audit/consent events. Unknown profile fields are rejected. No passwords are stored in BONUSPLAY.
- Same-origin mutation guard, no-store responses, API security headers and process-local rate limiting added.
- Database audit/consent update/delete triggers enforce append-only history.

## Remaining findings and launch blockers

| Finding | Severity | Disposition |
|---|---|---|
| brace-expansion 5.0.9 parsing/recursive patterns | High (two), moderate (one) | Update its build-tool parents or compatible patched version, then rebuild/test; not used as a V2 financial input parser |
| braces 3.0.3 nested pattern exhaustion | High | No fix supplied by scan; investigate parent/reachability and safer supported update during hardening |
| source-map-js 1.2.1 indexed-map denial of service | High | Compatible 1.2.2 patch/parent update requires follow-up validation |
| fast-uri 3.1.7 host normalization | Moderate | Update parent/compatible 3.1.8 patch |
| postcss-selector-parser 6.0.10 CPU exhaustion | Moderate | Scan recommends major upgrade; update parent and check build compatibility rather than blindly replacing |
| Legacy demo `res.cookie` session-fixation heuristic | Static medium | Demo IDs are server-generated, cookies are HMAC-signed and expiring. Existing session reuse is demo behavior; V2 does not use this identity. Preserve scope boundary and investigate before changing demo behavior |

Privacy/dataflow scan reported no findings. This does not certify legal compliance.

Rate limiting is not yet shared across autoscale instances. Production Clerk environment/allowed domains, email delivery/reset, admin operator provisioning, verified external offers, financial tests for the new ledger and incident/restore evidence remain launch gates. The existing demo financial regression suite is not evidence for a live reward economy.
