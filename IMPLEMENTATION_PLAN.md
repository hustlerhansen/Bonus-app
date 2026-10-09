# BonusPlay — implementeringsplan for MVP

Godkjent retning: utviklingsmodell A (Claude Code). Planen bygger på `PLATFORM_ANALYSIS.md`, `DEVELOPMENT_PLAN.md` og eierens rammer fra 2026-10-09.

Målet er en komplett, sikker og lønnsom MVP som kan lanseres raskt. Eksisterende kode som fungerer beholdes, og prosjektet bygges ikke på nytt. Hver fase avsluttes med typekontroll og alle automatiske tester.

## Faste rammer (kan ikke endres uten eierens godkjenning)

| Ramme | Verdi | Håndheving |
|---|---|---|
| Poengverdi | 100 BP = 1 kr | Lagret i konfigurasjon. CHECK i databasen tillater bare 100. |
| Standard brukerandel | 30 % | Konfigurasjon, versjonert |
| Maks brukerandel | 40 % | CHECK i databasen |
| Minstemargin | ≥ 50 % av netto partnerinntekt | Lønnsomhetskontroll før aktivering. CHECK: aldri under 50 %. |
| Finansiering | Alle poeng med pengeverdi har en finansieringskilde | Krav i poengmotoren + CHECK i databasen |
| XP og nivåer | Adskilt fra innløselige poeng | Egen tabell, ingen kobling til poengboken |
| Gavekort | Alle innløsninger kontrolleres manuelt | Ingen automatisk utsending. Adapter for senere automatikk. |
| Høyrisiko | Ekstra bekreftelse og minst 60 min ventetid | Godkjenningskø, CHECK i databasen og MFA-reverifisering |
| Egen fordel | Administrator kan aldri behandle egen konto eller egne ordre | Poengmotoren, premie- og konverteringsflyt |
| Demo | Privat, bare for testere | Krever innlogget testbruker |

## Fase A — Sikkerhetsgrunnmur

| # | Oppgave | Akseptansekriterier |
|---|---|---|
| A1 | CI (GitHub Actions + PostgreSQL 16) | Typekontroll og alle V2-tester kjører ved hver push og PR |
| A2 | Migrasjonssikring | `drizzle-kit push` ser ikke V2-tabeller (`tablesFilter`). V2 endres bare via SQL-migrasjoner. |
| A3 | Forbud mot selvbehandling | Tester: admin kan ikke justere, godkjenne, refundere eller reversere på egen konto. Kan ikke sende ut egen ordre eller godkjenne egen konvertering. |
| A4 | MFA for administratorer | Alle `/v2/admin/*` krever aktiv andrefaktor (Clerk). Bekreftelse av høyrisiko krever ny MFA (≤ 10 min). Policytester. |
| A5 | Logg over administrativ tilgang | Hvert kall til `/v2/admin/*`, også lesing, gir en audit-rad med aktør, metode, rute og status |
| A6 | Godkjenningskø for høyrisiko | Justeringer, generiske beslutninger og kompensasjoner, godkjenning av tilbud og premier, økonomikonfigurasjon, markedsbudsjett og utsending av dyre ordre går via kø. Kan ikke utføres før ventetiden er ute. Utføres maks én gang. Innholdet kan ikke endres. Kansellering er mulig. Med `dual_control` må en annen administrator bekrefte. Tester for alt dette. |
| A7 | `SECURITY_AUDIT.md` | Avhengighetsfunn vurdert og dokumentert |

## Fase B — Bærekraftig poengøkonomi

| # | Oppgave | Akseptansekriterier |
|---|---|---|
| B1 | Versjonert økonomikonfigurasjon | Versjon 1: 100 BP/kr, 30 %, maks 40 %, min 50 %, 60 min ventetid. Kan bare endres via kø. Verdier utenfor rammene avvises av databasen. |
| B2 | Kampanjeøkonomi og automatisk lønnsomhet | Utkast krever CPA, nettverksgebyr, forventet tilbakeføring, gavekortgebyr, maks antall konverteringer, betalingsfrist og avtalereferanse. Poengene beregnes av serveren. Godkjenning avvises hvis marginen er under minimum eller andelen over maks. |
| B3 | Finansieringskrav | EARN, REFERRAL og BONUS samt positive justeringer krever en finansieringskilde (konvertering eller godkjent markedsbudsjett med nok saldo). Databasen avviser kreditt uten finansiering. |
| B4 | Kampanjetak | Ny konvertering avvises når maks antall er nådd |
| B5 | Prissetting av premier | Pålydende i kr gir poeng = pålydende × 100. Innkjøpspris lagres. |
| B6 | Rapport over poenggjeld | Viser utestående, reservert og ventende poeng i kr, samt forbruk per budsjett og kampanje |
| B7 | XP, nivåer, streak og merker | Daglig innsjekking gir XP (én per dag, Oslo-tid). Ingen BP opprettes. Tester. |

## Fase C — Sikker manuell gavekortlevering

| # | Oppgave | Akseptansekriterier |
|---|---|---|
| C1 | Leveringsmodus per leverandør | Bare `manual` er tillatt i MVP (CHECK). Grensesnitt for automatiske leverandører finnes, men er deaktivert. |
| C2 | Kryptert gavekortkode | «Levert» krever kode eller lenke. Lagres kryptert (AES-256-GCM). Bare eier kan se den. Hver visning logges. Ingen kode i logger eller e-post. |
| C3 | Innløsningsregler | Minste kontoalder, minimum verifisert opptjening og dagsgrense, alt fra konfigurasjonen. Tester. |

## Fase D — Admin, privat demo og brukeropplevelse

| # | Oppgave | Akseptansekriterier |
|---|---|---|
| D1 | Admin-hub `/account/admin` | Oversikt (poenggjeld), godkjenningskø, økonomi og budsjetter, revisjonslogg og testere |
| D2 | Privat demo | Demo-økt krever innlogget, registrert V2-konto på testerlisten. Banner «TESTVERSJON». Ingen offentlig demo-admin. Demopoeng kan aldri nå V2. |
| D3 | Nytt hjem `/account` | Saldo (tilgjengelig/ventende), nivå og streak, anbefalte tilbud, siste aktivitet og tydelige knapper. Mobil først, norsk. |
| D4 | Personvern | Brukeren kan laste ned egne data (JSON) og be om sletting (økonomihistorikk beholdes etter oppbevaringsregel) |

## Utenfor MVP (bevisst utsatt)

Automatisk gavekortlevering, aktivering av verving, partnerportal, Stripe, AI-assistanse, distribuert rate limiting (én instans ved lansering) og Google/Apple-innlogging.

## Kostnader

| Kategori | Post | Anslag |
|---|---|---|
| **Nødvendig før lansering** | Juridisk gjennomgang (vilkår, personvern, gavekort, markedsføring) | 40–100k kr |
| | Uavhengig sikkerhetstest | 50–120k kr |
| | Ekstern kodegjennomgang (modell A, ≈15 %) | 110–190k kr |
| | Clerk med MFA. Gratisplanen kan være utilstrekkelig for MFA i produksjon, må verifiseres. | 0–1 500 kr/mnd |
| | Hosting + PostgreSQL | 500–2 000 kr/mnd |
| | Forhåndsbetaling hos gavekortleverandør (kapital, ikke kostnad) | 10–25k kr |
| **Kan utsettes** | Transaksjonell e-post (Clerk sender innloggings-e-post) | 0–300 kr/mnd |
| | Feilsporing (logger er nok ved lansering) | 0–500 kr/mnd |
| | Distribuert rate limiting (Redis) | utsatt |
| | Automatisk gavekort-API, AI, Stripe | utsatt |
| **Oppstår med brukere og omsetning** | Gavekort (pålydende + 0–3 % gebyr) | finansiert av partnerinntekt |
| | Nettverksgebyr hos affiliatenettverk | trekkes fra partnerinntekt |
| | Høyere planer for hosting og Clerk ved volum | etter bruk |
| | GitHub Actions utover gratiskvoten | 0 kr ved normal bruk |

Ingen betalte tjenester legges til uten at det er nødvendig. Ingen leverandøravtaler inngås uten eierens godkjenning.

## Stoppunkter (krever eierens beslutning)

Økonomiske forpliktelser, juridiske spørsmål, produksjonssetting (migrasjoner, åpning av aktiveringsporter, publisering) og vesentlige endringer i forretningsmodellen.
