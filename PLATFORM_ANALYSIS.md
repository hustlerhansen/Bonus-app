# BONUSPLAY — plattformanalyse og prioritert forbedringsplan

Dato: 2026-10-08 · Grunnlag: commit `8884f6c` (overført fra Replit) · Type: **kun analyse, ingen kodeendringer**

---

## 0. Sammendrag

1. **Repoet inneholder to separate produkter.** Det ene er en **demo (v1)**. Den er publisert og ferdig bygget, men all økonomi i den er simulert. Det andre er **V2**, en produksjonsrettet plattform. Kjernen i V2 er solid bygget, men alt er stengt bak lukkede aktiveringsporter. Ingen ekte poeng, tilbud eller gavekort er i drift.
2. **Poengboken i V2 er det sterkeste i kodebasen.** Den er append-only, låser kontoer, har idempotens, er atomisk og har avstemming. Alle 101 automatiske tester består.
3. **Det største sikkerhetshullet er manglende arbeidsdeling mellom administratorer.** Én administrator kan alene gi seg selv opptil 1 000 000 BP per transaksjon, uten tak på antall transaksjoner. Den samme administratoren kan opprette og godkjenne en premie, løse den inn og sende den til seg selv. Dette er **bekreftet** i en isolert testdatabase.
4. **Økonomien er ikke modellert i V2.** Poeng har ingen fast kroneverdi. Tilbud lagrer ikke hva partneren betaler. Premier lagrer ikke innkjøpspris. Det finnes heller ingen budsjett- eller marginregel. Plattformen kan derfor ikke vise om den tjener eller taper penger.
5. **Demoens økonomi er ikke bærekraftig.** Den deler ut rundt 2 400 poeng (≈ 24 kr) per aktiv bruker per dag uten noen inntekt bak (kister, spill, streak, simulert verving). Inntektene er dessuten hentet fra en mock som alltid regner 2,5 × belønningen som inntekt. Denne modellen må ikke tas med inn i V2.
6. **Gavekortinnløsning er bare halvferdig.** Reservasjon, lager og refusjon fungerer. Selve leveringen er derimot helt manuell, og gavekortkoden kan ikke gis til brukeren i appen.
7. **Mangler før lansering:** verving, partnerportal, betaling (Stripe), e-post, GDPR-eksport og -sletting, CI, prosess for produksjonsmigrering, overvåking, og et dashboard for V2.

---

## 1. Omfang og metode

| Kontroll | Resultat |
|---|---|
| Gjennomgang av all kildekode (API, database/migrasjoner, frontend, dokumentasjon) | Utført |
| `pnpm run typecheck` (hele arbeidsområdet) | ✅ Består |
| `test:v2` (tilgangspolicy) | ✅ 4/4 |
| `test:v2-points` (poengbok og avstemming) | ✅ 50/50 |
| `test:v2-offers` (tilbud, callbacks, reversering) | ✅ 30/30 |
| `test:v2-rewards` (premier, lager, refusjon) | ✅ 13/13 |
| `test:v2-cache` (frontend-cache) | ✅ 4/4 |
| `test:demo-financial` | ⚠️ Ikke kjørt. Testen krever en kjørende API-server på port 80 med Clerk-nøkler. |
| `pnpm audit --prod` | ⚠️ 1 high: `braces` via `http-proxy-middleware` |
| Egen verifisering av arbeidsdeling (isolert, midlertidig PostgreSQL-skjema som ble slettet etterpå) | ❌ Selvbehandling er mulig, se §4 |

Testene ble kjørt mot en midlertidig lokal PostgreSQL 16 som er stoppet igjen. Ingen delt database eller produksjonsdatabase ble berørt.

---

## 2. Arkitektur: to systemer side om side

| | **Demo (v1)** `/api/bonusplay/*` | **V2** `/api/v2/*` |
|---|---|---|
| Identitet | Signert demo-cookie. Alle kan bli «admin». | Clerk (e-post/passord, verifisert e-post). Rollene styres i databasen. |
| Poeng | `wallet_transactions` (summeres, enkel modell) | `v2_points_transactions` + `v2_points_events` (append-only, livsløp) |
| Opptjening | Aktiviteter, spill og kister. Mock-leverandør godkjenner alt. | Godkjente tilbud, signerte partner-callbacks og administratorgodkjenning |
| Premier | 5 demopremier, ingen levering | Leverandør, SKU, lager, reservasjon og manuell leveringskø |
| Status | Publisert demo | Bygget og testet i utvikling, **portene er lukket** |

Stack: pnpm-monorepo, React 19/Vite/Wouter/React Query/Tailwind/shadcn, Express 5, PostgreSQL/Drizzle og OpenAPI/Orval. I tillegg finnes en film og en mockup-sandkasse, som ikke er relevante for plattformen.

---

## 3. Funksjonsstatus

Tegnforklaring: ✅ fungerer · 🟡 uferdig / delvis · ❌ mangler

### 3.1 Brukerregistrering og innlogging

| Funksjon | Status | Kommentar |
|---|---|---|
| Registrering og innlogging via Clerk | ✅ | `/sign-up`, `/sign-in`, `/account`. E-postverifisering sjekkes på serveren mot Clerk (`accounts.ts`). |
| Samtykke til vilkår og personvern med versjon og tidspunkt | ✅ | `v2_consents` er append-only |
| Rolle settes alltid til USER, ingen selvforfremmelse | ✅ | Roller tildeles bare via operatørskriptet `provision-v2-role.mjs` |
| Profilredigering | ✅ | Med audit og radlås |
| Glemt/tilbakestill passord | 🟡 | Clerk tilbyr dette, men levering av e-post er **ikke verifisert** (fase-1-port) |
| 18-årsgrense | 🟡 | Bare en avkrysningsboks. Fødselsdato eller alderskontroll finnes ikke. |
| Synkronisering mot Clerk (sletting, utestengning, e-postendring) | ❌ | Ingen Clerk-webhooks. `v2_accounts.email` oppdateres aldri etter registreringen. |
| Google/Apple-innlogging | ❌ | Bare forberedt |
| MFA-krav for administratorer | ❌ | Håndheves ikke på serveren |
| Felt for vervekilde (`referralSource`) | ❌ | Vervekode genereres, men brukes ikke til noe |

### 3.2 Poengsystemet

| Funksjon | Status | Kommentar |
|---|---|---|
| V2: uforanderlig poengbok med 8 typer og 4 statuser | ✅ | Triggere i databasen hindrer UPDATE og DELETE |
| V2: saldo, reservert, tilgjengelig, ventende og livstidstall | ✅ | Regnes ut fra hendelser. Det finnes ingen saldo-kolonne som kan endres. |
| V2: idempotens og beskyttelse mot replay | ✅ | Global nøkkel med fingerprint, og `(source, reference)` er unik |
| V2: samtidighetskontroll og hindring av negativ saldo | ✅ | Kontoene låses i sortert rekkefølge. Testene dekker parallelle trekk. |
| V2: refusjon og reversering (hele beløpet) | ✅ | Kan bare skje én gang per original |
| V2: lesende avstemming hvert 15. minutt | ✅ | Varsler bare via logg, ikke ekstern varsling |
| V2: admin-UI for justering og beslutning | ✅ | `/account/points/admin` |
| V2: delvis refusjon | ❌ | Bevisst utelatt |
| V2: utløp av poeng (EXPIRATION) | ❌ | Typen finnes, men ingen policy eller jobb |
| V2: arbeidsdeling (to personer) ved justeringer | ❌ | **Kritisk**, se §4 |
| V2: kroneverdi og gjeldsrapport | ❌ | Se §5 |
| Demo: summert poengbok med idempotens | ✅ | Men den har ingen pending/approved-livsløp |

### 3.3 Opptjening og tilbud (V2)

| Funksjon | Status | Kommentar |
|---|---|---|
| Admin oppretter utkast → godkjenner → avviser | ✅ | Vilkårene kan ikke endres etterpå |
| Tilbudsliste og detaljside for brukere | ✅ | `/account/offers` (spesifikasjonen sa `/earn`) |
| Klikksporing (`bp_click`) | ✅ | Klikk alene gir aldri poeng |
| Signerte partner-callbacks (HMAC, tidsstempel, nonce) | ✅ | Godt implementert, med rå body og konstant-tids-sammenligning |
| Pending → admin-godkjenning → poeng | ✅ | |
| Reversering av godkjente konverteringer | ✅ | |
| Én konvertering per bruker per tilbud | ❌ | Bare ett klikk per konvertering. En bruker kan starte samme tilbud mange ganger. |
| Partnerens betaling per konvertering (`partnerRevenue`) | ❌ | Lagres ikke |
| Kampanjer, budsjett og tak | ❌ | Hører til fase 6–7 |
| Kategorifilter, «Featured», paginering | 🟡 | Kategorier finnes. Listen er kuttet ved 100 og har ingen paginering. |
| Undersøkelser og annonser (V2) | ❌ | Finnes bare som mock i demoen |

### 3.4 Rewards Store (V2)

| Funksjon | Status | Kommentar |
|---|---|---|
| Katalog, detaljside, bekreftelse med pris fra serveren | ✅ | `/account/rewards` |
| Reservasjon av poeng og lager i én transaksjon | ✅ | Testet med samtidige forespørsler |
| Ordrehistorikk for brukeren | ✅ | `/account/orders` |
| Admin: utkast → godkjenning → deaktivering | ✅ | Pris, vilkår og totallager kan ikke endres etterpå |
| Leverandører og risikosperrer | 🟡 | Kan **bare** opprettes direkte med SQL. Det finnes ingen admin-UI. |
| Innkjøpspris og pålydende i kroner per premie | ❌ | Bare BP-pris lagres |
| Innløsningsgrenser (per dag/måned, kontoalder, minimum verifisert opptjening) | ❌ | |
| Paginering i admin-køen | ❌ | Ubegrensede lister |

### 3.5 Gavekortinnløsning

| Trinn | Status | Kommentar |
|---|---|---|
| Bruker løser inn → poeng reserveres → ordren får status `reserved` | ✅ | |
| Admin markerer utsending (`delivering`) → `uncertain` → `delivered` | ✅ | Statusmaskinen er god og konservativ |
| Refusjon ved bekreftet ikke-levering | ✅ | Lagerenheten frigis |
| **Faktisk bestilling hos leverandør** | ❌ | Manuelt, utenfor systemet |
| **Utlevering av gavekortkode eller lenke til brukeren** | ❌ | Det finnes ikke noe felt for kode, ingen kryptert lagring og ingen visning i appen |
| E-postvarsel om ordrestatus | ❌ | Ingen e-postleverandør |
| Leverandøravstemming (deres register mot vårt) | 🟡 | Avstemmingen er intern. Sammenligning mot leverandøren gjøres manuelt. |
| PayPal/kontantutbetaling | ❌ | Finnes bare i demoen. Bør **ikke** innføres ved lansering (regulatoriske krav). |

### 3.6 Adminpanel

| Område | Status | Kommentar |
|---|---|---|
| Demo-admin `/admin` | ✅ (demo) | Nøkkeltallene er **hardkodet** (`service.ts:305`), og alle besøkende kan bli admin |
| V2: poeng, tilbud, konverteringer, premier, leveringskø, avstemming | ✅ | Tre separate sider, ikke ett samlet panel |
| V2: brukeradministrasjon (søk, sperring, roller) | ❌ | Kontoer slås opp på ID. Roller endres via CLI. |
| V2: oversikt med KPI-er og økonomi | ❌ | |
| V2: svindelkø og risikosperrer i UI | ❌ | |
| V2: audit-visning | 🟡 | Audit-loggen skrives (append-only), men har ingen søkbar visning |
| Partner- og supportmoduler | ❌ | |

### 3.7 Engasjement (streak, nivåer, spill, verving)

| Funksjon | Demo | V2 |
|---|---|---|
| Streak og nivåer/XP | ✅ | ❌ |
| Minispill (Tap, reaksjon, Memory) | ✅ (ingen bevis for resultat på serveren) | ❌ |
| Arrangementer, kister, topplister | ✅ (simulert, topplistene er seedet) | ❌ |
| Verving | 🟡 Simulert: hvem som helst kan hente «aktiv venn» (500 p) hver dag | ❌ (bare vervekode) |
| Dashboard etter spesifikasjonen (velkomst, saldo, anbefalinger, streak, «X BP til Gold») | ✅ (demo) | ❌ |

### 3.8 Plattformfunksjoner

| Funksjon | Status |
|---|---|
| Partnerregistrering, kampanjer og partnerportal | ❌ (`/business` er bare en informasjonsside) |
| Stripe-finansiering, webhooks og faktura | ❌ |
| Transaksjonell e-post | ❌ |
| GDPR: eksport, sletting/anonymisering, samtykke til informasjonskapsler | ❌ (status `DELETION_REQUESTED` finnes, men ikke selve flyten) |
| Juridisk gjennomgåtte vilkår og personvern | ❌ (bare utkast) |
| Support og henvendelser | ❌ |
| PWA (manifest, service worker uten API-cache) | ✅ |

---

## 4. Sikkerhet

### Sterke sider (beholdes)
- Pengebeløp og identitet kommer alltid fra serveren, aldri fra nettleseren. Input valideres strengt (`.strict()`), og ekstra felt avvises.
- Append-only-triggere, CHECK-regler og unike nøkler i PostgreSQL gir forsvar i dybden.
- HMAC-callbacks med tidsvindu, nonce-register og konstant-tids-sammenligning.
- V2 krever samme opprinnelse (Origin/Sec-Fetch-Site), fjerner CORS-hodene, bruker `no-store` og rate limiting.
- Logger og avstemmingsrapporter inneholder ikke persondata, og hemmeligheter ligger bare i miljøvariabler.

### Funn

| # | Alvorlighet | Funn | Hvor |
|---|---|---|---|
| S1 | **Kritisk** (før portene åpnes) | **Arbeidsdeling mangler.** Én ADMIN kan justere egen konto med opptil ±1 000 000 BP per transaksjon, uten tak på antall. Samme person kan godkjenne egne konverteringer, opprette og godkjenne egne premier, og løse inn og sende ut egne ordre. Verifisert: to selvjusteringer ga 2 000 000 BP, og en ordre på egen premie ble selvsendt til `delivering`. | `v2/points.ts:115-119, 181`, `v2/offers.ts:234`, `v2/rewards.ts:116, 132, 190` |
| S2 | Høy | MFA håndheves ikke for ADMIN/SUPER_ADMIN. Ett lekket passord gir full tilgang til økonomien. | `v2/accounts.ts` (`requireAccount`) |
| S3 | Høy | Ingen Clerk-webhooks. En bruker som slettes eller utestenges i Clerk, eller som endrer e-post, får ikke oppdatert V2-kontoen. | `v2/accounts.ts` |
| S4 | Høy (demo) | Alle kan bli demo-admin og endre den **globale** katalogen og funksjonsbryterne i den publiserte demoen. Det gir risiko for hærverk. | `routes/bonusplay.ts:46`, `:79-111` |
| S5 | Middels | `drizzle-kit push`/`push-force` ligger ved siden av SQL-migrasjonene. Drizzle-skjemaet avviker fra SQL (navn på indekser og constraints, CHECK-regler, triggere). En «push» kan derfor endre eller fjerne V2-vern. Det finnes heller ingen prosedyre for produksjonsmigrering (`migrate.mjs` godtar bare `--development`). | `lib/db/package.json`, `lib/db/src/schema/v2-*.ts` |
| S6 | Middels | Rate limiting lagres i minnet per prosess, både med `express-rate-limit` og et eget `Map` i demoen. Grensen gjelder derfor ikke på tvers av replikaer. | `routes/v2.ts`, `routes/bonusplay.ts:21` |
| S7 | Middels | Global `cors()` med jokertegn. V2 fjerner hodene, og demoen er bare beskyttet av `sec-fetch-site`. | `app.ts:38` |
| S8 | Middels | Avhengighet med kjent sårbarhet (high): `braces` via `http-proxy-middleware`. `SECURITY_AUDIT.md` er nevnt i planen, men **finnes ikke i repoet**. | `pnpm audit` |
| S9 | Middels | En bruker kan starte samme tilbud ubegrenset mange ganger, og hvert klikk kan gi én konvertering. Hvis en partner rapporterer feil, kan brukeren få dobbel opptjening på «kun nye kunder»-tilbud. | `v2/offers.ts:151` |
| S10 | Middels | Ingen automatisk svindeldeteksjon i V2. Risikosperrer settes bare manuelt via SQL, og det finnes ingen hastighetsgrenser for innløsning. | `v2/rewards.ts` |
| S11 | Lav (demo) | Spill- og aktivitetsbelønninger kan hentes med et direkte API-kall uten bevis (dette er dokumentert). Verving kan hentes daglig uten venner. | `bonusplay/service.ts:153` |
| S12 | Lav | Det finnes ingen CI. Testene kjøres bare manuelt og krever PostgreSQL. | — |

---

## 5. Økonomisk bærekraft

### 5.1 Demoen: hva den deler ut per aktiv bruker per dag

Grunnlag: katalogen (`bonusplay/catalog.ts`). 100 poeng = 1 kr, som i demopremiene (10 000 p = 100 kr).

| Kilde | Poeng/dag | Inntekt bak? |
|---|---|---|
| Kister (bronse, sølv, gull, diamant) | 900 | ❌ Nei |
| Minispill (3 × 3 økter) | 405 | ❌ Nei |
| Oppdrag uten leverandør (spill, challenge, utforsk, memory, reaksjon) | 305 | ❌ Nei |
| Simulert verving («aktiv demovenn»), daglig | 500 | ❌ Nei |
| Streak (snitt over syklus på 7 dager) | ~171 | ❌ Nei |
| Nivåbonus (100 p per 1 500 XP, ~1 400 XP/dag) | ~94 | ❌ Nei |
| **Sum uten inntekt** | **≈ 2 400 (≈ 24 kr)** | |
| Undersøkelser, tilbud og annonse (mock-«inntekt») | ≈ 7 200 (≈ 72 kr) | Mock: inntekt = 2,5 × belønning |
| **Mulig maksimum per dag** | **≈ 9 600 (≈ 96 kr)** | |

Konsekvenser:
- Med ~24 kr/dag uten inntekt koster en aktiv bruker ~**720 kr/mnd** i poenggjeld, selv uten tilbud. Et gavekort på 100 kr kan opptjenes på ~4 dager bare med gratisaktiviteter.
- Tilbud kan gjentas **hver dag** (f.eks. «Prøv en tjeneste», 2 000 p). Ekte CPA-tilbud gjelder normalt én gang per person.
- Mock-leverandøren regner alltid ut inntekt som 2,5 × belønning (`providers.ts:15-17`). «Bruttobidrag» i admin blir dermed alltid positivt, uansett hva som skjer. Nøkkeltallene i admin er dessuten hardkodet.
- **Konklusjon:** Demoens økonomi er et UI-konsept. Den må ikke brukes som forretningsmodell eller importeres til V2. V2 er riktig nok bygget med null startsaldo og uten demoimport.

### 5.2 V2: hva som mangler for å kunne styre økonomien

| Mangel | Hvorfor det er viktig |
|---|---|
| Ingen fast regnskapsverdi per BP | Poenggjelden kan ikke uttrykkes i kroner |
| Tilbud lagrer ikke hva partneren betaler (CPA i øre) | Det kan ikke håndheves at brukerbelønningen er lavere enn inntekten |
| Premier lagrer ikke pålydende eller innkjøpspris | Margin og kostnad per innløsning kan ikke beregnes |
| Ingen marginregel ved godkjenning | En admin kan godkjenne 10 000 BP for et tilbud som betaler 20 kr |
| Ingen budsjett eller tak per partner og kampanje | Kostnadene har ingen øvre grense |
| Ingen rapport over poenggjeld | Saldo × verdi, ventende og reservert vises ikke for ledelsen |
| Ingen regel om at partneren må ha betalt før poeng kan brukes | Risiko for å betale ut gavekort før partneren har betalt |
| Ingen utløpspolicy | Gjelden vokser for alltid (krever juridisk vurdering) |

### 5.3 Anbefalt økonomimodell (forslag, krever din beslutning)

1. **Fast regnskapsverdi**, f.eks. 100 BP = 1 kr. Dette er en intern bokføringsverdi, ikke et løfte om innløsning.
2. **Inntektsstyrt opptjening:** `poeng ≤ andel × partnerens netto CPA`, f.eks. en andel på 30–50 %. Regelen håndheves i databasen når tilbudet godkjennes.
3. **Premiepris:** `BP-pris ≥ innkjøpspris × 100 / (1 − ønsket margin)`. Lagre pålydende og innkjøpspris per premie.
4. **Penger før premie:** Poeng blir først tilgjengelige når partnerens betaling er bekreftet eller godkjenningsperioden (`approvalDays`) er utløpt.
5. **Engasjementspoeng holdes atskilt:** Streak, spill og kister bør gi XP, nivå og merker. Alternativt kan de gi en liten, budsjettert mengde BP med et fast tak (f.eks. maks X kr per bruker per måned), finansiert av markedsføringsbudsjettet.
6. **Innløsningsterskel og grenser:** minste innløsning, kontoalder og minimum verifisert opptjening før første gavekort, og tak per dag og måned.
7. **Dashboard for poenggjeld** i admin: utestående, ventende og reservert i kroner, samt bidrag per partner og tilbud.
8. **Ingen kontantutbetaling (PayPal) ved lansering.** Gavekort først. Kontanter kan utløse krav etter regelverket for betalingstjenester og hvitvasking. Det må vurderes juridisk, sammen med skatt for brukerne og om premiekonkurranser og topplister faller inn under pengespilloven.

---

## 6. Teknisk gjeld og drift

- **To parallelle systemer** (demo og V2) med egne tabeller, sesjoner og UI øker vedlikeholdet. Det trengs en beslutning om demoens fremtid.
- **Skalering:** Saldo regnes ut fra alle hendelser ved hvert kall. Avstemmingen leser hele poengboken inn i minnet hvert 15. minutt. Alle premieskrivinger går gjennom én global advisory-lås. Dette er greit ved lansering, men må forbedres ved vekst.
- **Lister uten paginering** i admin (ordre, premier). Tilbud og konverteringer er kuttet ved 100.
- **Drift:** Ingen ekstern varsling, ingen «dead-man»-alarm, ingen feilsporing og ingen verifisert backup- og gjenopprettingsøvelse (dokumentert som åpne punkter i `LAUNCH_CHECKLIST.md`).
- **Avhengighet til Replit:** `.replit`, `@replit/connectors-sdk`, Replit-spesifikke Vite-plugins og en gateway som forutsetter samme opprinnelse for `/` og `/api`. Når prosjektet flyttes fra Replit trengs en reverse proxy og en ny driftsplattform.
- **Dokumentasjon:** Dokumentasjonen er grundig og ærlig (`CURRENT_STATE.md`, `V2_*.md`, `RUNBOOK.md`), men `SECURITY_AUDIT.md` mangler.

---

## 7. Prioritert forbedringsplan

Innsats: S = liten (≤ 2 dager), M = middels (≤ 1 uke), L = stor (> 1 uke).

### P0 — blokkerer enhver åpning av portene

| # | Tiltak | Innsats |
|---|---|---|
| 1 | **Arbeidsdeling:** forby at aktør og mottaker er samme person (justering, konverteringsgodkjenning, ordre). Den som oppretter et tilbud eller en premie skal ikke kunne godkjenne den selv. Justeringer over en terskel krever to administratorer. Innfør daglig tak per administrator. Kontrollene legges både i tjenestelaget og i databasen. | M |
| 2 | **MFA for ADMIN/SUPER_ADMIN**, kontrollert på serveren (Clerk-sesjonsfaktor eller org-policy). | S |
| 3 | **Økonomifelt og marginregel:** CPA per tilbud, pålydende og innkjøpspris per premie, regnskapsverdi per BP, marginkontroll ved godkjenning og rapport over poenggjeld. Gjøres med additive migrasjoner. | M |
| 4 | **CI** (GitHub Actions med en PostgreSQL-tjeneste): typecheck og alle V2-tester på hver push og PR. | S |
| 5 | **Trygg migrasjonsprosess:** fjern eller sperr `drizzle push` for V2-tabeller, og lag en gjennomgått prosedyre for produksjonsmigrering. | S–M |
| 6 | **Sårbarheter:** oppgrader eller overstyr `braces`/`http-proxy-middleware`, og opprett `SECURITY_AUDIT.md` på nytt. | S |
| 7 | **Fullfør fase-1-portene:** produksjonsoppsett av Clerk, verifisert levering av e-post for verifisering og tilbakestilling, og Clerk-webhooks for sletting, utestengning og e-postendring. | M |

### P1 — minimumsprodukt for kommersiell lansering med gavekort

| # | Tiltak | Innsats |
|---|---|---|
| 8 | **Gavekortlevering:** leverandørintegrasjon via API med ordre-UUID som idempotensnøkkel, *eller* manuell flyt med kryptert lagring av koden og visning bare for eieren i `/account/orders`. Statusvarsel på e-post. | L |
| 9 | **Svindel- og risikoregler:** grenser per dag og måned, kontoalder og minimum verifisert opptjening før første innløsning, admin-UI for risikosperrer og signaler på duplikatkontoer (GDPR-vennlig). | M |
| 10 | **Én konvertering per bruker per tilbud** (konfigurerbart for tilbud som kan gjentas), håndhevet i databasen. | S |
| 11 | **Admin-UI for leverandører, partnere og brukere** (søk, sperring, rolleforespørsel med godkjenning fra to personer) i stedet for SQL og CLI. | M |
| 12 | **Dashboard for V2** etter spesifikasjonen: saldo, ventende, anbefalte tilbud og siste aktivitet. Gjenbruk demoens UI-komponenter på V2-data. | M |
| 13 | **GDPR og juridisk:** dataeksport, sletting og anonymisering (med regel for oppbevaring av økonomidata), juridisk gjennomgåtte vilkår og personvern, og nytt samtykke ved ny versjon. | M–L |
| 14 | **Transaksjonell e-post** (ordre, konvertering og konto). | M |
| 15 | **Distribuert rate limiting** (Redis eller PostgreSQL) og paginering i alle adminlister. | S–M |

### P2 — vekst og partnerside

| # | Tiltak | Innsats |
|---|---|---|
| 16 | **Verving (fase 5):** kvalifisering ved første verifiserte tilbud, ingen belønning ved registrering, og vern mot egen- og sirkelverving. | M |
| 17 | **Partnerportal og kampanjer (fase 6)** med budsjett, tak og pause. | L |
| 18 | **Stripe-finansiering (fase 7):** signerte, idempotente webhooks og avstemming mot oppgjør. | L |
| 19 | **Drift:** ekstern varsling, dead-man-alarm, feilsporing og gjenopprettingsøvelse. | M |
| 20 | **Gamification i V2** (streak, nivå, merker) uten poenggjeld uten finansiering, se §5.3 punkt 5. | M |

### P3 — opprydding og skalering

| # | Tiltak | Innsats |
|---|---|---|
| 21 | **Demoens fremtid:** gjør demo-admin skrivebeskyttet eller sesjonslokal, eller avvikle demoen når V2 lanseres. | S |
| 22 | **Skalering:** saldo-snapshots eller materialiserte summer, inkrementell avstemming og fjerning av den globale premielåsen. | M–L |
| 23 | Google- og Apple-innlogging, delvis refusjon og utløpspolicy for poeng (etter juridisk vurdering). | M |
| 24 | Plan for drift utenfor Replit (gateway og hosting). | M |

---

## 8. Beslutninger som trengs fra deg før videreutvikling

1. **Poengverdi og andel til brukerne:** Er 100 BP = 1 kr riktig? Hvor stor andel av partnerinntekten skal gå tilbake til brukerne?
2. **Gavekortleverandør og leveringsmodell:** API-integrasjon eller manuell drift i starten?
3. **Kontantutbetaling (PayPal):** Anbefalingen er nei ved lansering.
4. **Engasjementspoeng:** Skal streak, spill og kister gi innløsbare BP (med et budsjettak), eller bare XP og merker?
5. **Demoen:** Skal den beholdes offentlig, låses eller avvikles?
6. **Administratorer:** Hvem blir SUPER_ADMIN, og hvem kan være person nummer to ved godkjenninger?
7. **Utløp av poeng:** Ønskes en utløpspolicy (f.eks. etter 12 måneder uten aktivitet), med juridisk gjennomgang?

---

*Dette dokumentet er en analyse. Ingen eksisterende kode, migrasjoner, data eller konfigurasjon er endret.*
