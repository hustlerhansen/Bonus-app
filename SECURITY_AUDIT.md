# BONUSPLAY — sikkerhetsrevisjon

Sist oppdatert: 2026-10-09. Dokumentet er internt. Den nyeste gjennomgangen står først. Den opprinnelige fundamentgjennomgangen fra 2026-10-07 er beholdt uendret nederst.

## Lukket i fase A (MVP-herding)

| Funn | Tiltak | Bevis |
|---|---|---|
| Én administrator kunne gi seg selv poeng, godkjenne egne konverteringer og sende ut egne ordre | Poengmotoren avviser alle beslutninger på egen konto. Premie- og konverteringsflyt avviser egne saker. Køen avviser forespørsler og bekreftelser som gagner aktøren (også med CHECK i databasen). | `test:v2-admin` |
| Høyrisikohandlinger ble utført umiddelbart | Godkjenningskø med ventetid på minst 60 min (CHECK i databasen). Bekreftes i et eget steg med ny MFA. Utføres maks én gang (unik indeks). Innholdet kan ikke endres (append-only). Valgfritt krav om to administratorer. | `test:v2-admin` |
| MFA ble ikke krevd for administratorer | Alle `/v2/admin/*` krever verifisert andrefaktor (Clerk `factorVerificationAge`). Bekreftelse av høyrisiko krever andrefaktor verifisert innen 10 min, ellers vises Clerks reverifiseringsdialog. | `test:v2` (policy) |
| Lesing av admindata ble ikke logget | Alle kall til `/v2/admin/*`, også avviste, gir en append-only audit-rad (`ADMIN_HTTP_ACCESS`) | rutekode |
| `drizzle-kit push` kunne endre eller slette migrasjonseide V2-objekter, og ble kjørt automatisk etter merge | `push` er erstattet av migrasjonsløperen. Demotabellene har en idempotent baseline-migrasjon (`0000`). Etter-merge-skriptet bruker migrasjoner. Verifisert at drizzle-kit push forsøkte `DROP SEQUENCE` på V2-sekvenser. | manuell verifisering på isolert database |
| Ingen CI | GitHub Actions: typekontroll, alle V2-tester mot PostgreSQL 16 og avhengighetsrevisjon | `.github/workflows/ci.yml` |

## Akseptert risiko

| Funn | Vurdering | Oppfølging |
|---|---|---|
| `braces` ≤ 3.0.3 (GHSA-vfj7-8cjw-p6xm, high, DoS ved dypt nøstede mønstre) via `http-proxy-middleware → micromatch`. Ingen rettet versjon finnes. | Mønstrene som sendes til `micromatch` er statiske stier i Clerk-proxyen, ikke brukerinput. Sårbarheten kan derfor ikke utløses fra nettleseren. CI feiler bare på kritiske funn. | Oppgrader når rettet versjon finnes. Vurder å fjerne proxyen hvis Clerk kjøres på eget domene. |
| Rate limiting lagres i minnet per prosess | Godtatt for lansering med én instans | Delt lager (Postgres/Redis) før horisontal skalering |
| Demo-cookie bruker `SameSite=None` i forhåndsvisning | Demoen gjøres privat for testere i fase D. Den har ingen kobling til V2-verdier. | Fase D |

## Krever eiers handling før produksjon

- Slå på MFA (TOTP) i Clerk for produksjonsinstansen. Uten det får ingen administrator tilgang.
- Eventuell kostnad for Clerk-plan med MFA må godkjennes.
- Uavhengig sikkerhetstest før kommersiell lansering.

---

## Opprinnelig fundamentgjennomgang (2026-10-07, uendret)

2026-10-07. Scope: development foundation and dependency/static/privacy scans. Not a penetration test or launch approval.

### Checks performed

- Three scans completed: dependency audit, static code scan and privacy/dataflow scan.
- Initial dependency audit: 1 critical, 4 high, 3 moderate.
- Fixed critical `proxy-addr` advisory through a compatible patch override to 2.0.8. Follow-up dependency audit confirms **0 critical, 4 high, 3 moderate**.
- Clerk peer requirements satisfied by React/React DOM patch update 19.1.0 → 19.1.4.
- V2 authentication is provider-verified. Enrollment reads the primary verified email server-side.
- V2 roles are local database membership, not public/user-editable metadata or demo session roles.
- Enrollment and profile writes are transactions with audit/consent events. Unknown profile fields are rejected. No passwords are stored in BONUSPLAY.
- Same-origin mutation guard, no-store responses, API security headers and process-local rate limiting added.
- Database audit/consent update/delete triggers enforce append-only history.

### Remaining findings and launch blockers

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
