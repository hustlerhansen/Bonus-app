# BONUSPLAY — sikkerhetsrevisjon (løpende)

Sist oppdatert: 2026-10-09. Dokumentet er internt. Det beskriver kjente funn, hva som er gjort og hvilke risikoer som er akseptert.

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
