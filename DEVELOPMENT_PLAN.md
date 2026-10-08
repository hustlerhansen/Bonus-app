# BonusPlay Rewards — utviklingsplan (til godkjenning)

Dato: 2026-10-08 · Status: **forslag, ikke godkjent** · Bygger på `PLATFORM_ANALYSIS.md` og eierens beslutninger av 2026-10-08.

Dette dokumentet er internt. Det inneholder tekniske og økonomiske detaljer som **ikke** skal deles eksternt. Den offentlige presentasjonen er en egen nettside uten disse detaljene.

Ingen kode er endret. Utviklingen starter først når du har godkjent planen.

---

## 1. Beslutninger planen bygger på

| # | Beslutning | Konsekvens i planen |
|---|---|---|
| 1 | 100 BP = 1 kr i gavekortverdi | 1 BP = 1 øre. Regnskap og kontroller føres i øre. |
| 2 | Brukerandel ≈ 30 % av netto partnerinntekt, konfigurerbar (35–40 % kan testes senere) | Andelen lagres som versjonert konfigurasjon. Endringer er høyrisiko og krever manuell godkjenning. Systemet har et øvre tak (forslag: 40 %). |
| 3 | Lønnsomhetsberegning før hver kampanje aktiveres | Aktivering blokkeres hvis beregningen mangler eller ikke holder kravene |
| 4 | Ingen innløselige poeng uten dokumentert finansiering | Hver kreditt må peke på en finansieringskilde: verifisert konvertering eller budsjettert pott med saldo. Dette håndheves i databasen. |
| 5 | Gavekort leveres manuelt i fase 1, automatisk senere | Først sikker manuell levering, deretter en adapter for automatisering |
| 6 | Ingen PayPal eller kontanter ved lansering | Ingen slike flyter bygges |
| 7 | Spill, streak, innlogging og kister gir XP, nivåer og merker | Egen XP-bok i V2, atskilt fra BP |
| 8 | Demoen beholdes, bare for testbrukere og tydelig merket | Tilgangskontroll, merking og bevis på at det ikke finnes noen vei til ekte verdi |
| 9 | Du er hovedadministrator, med støtte for én ekstra godkjenner | Kø for høyrisikohandlinger. Ingen høyrisikohandling skjer automatisk. |
| 10 | Ingen utløp av poeng ved lansering | Vilkår og UI sier dette tydelig. EXPIRATION brukes ikke. |

---

## 2. Økonomimodellen i praksis

### 2.1 Poeng per konvertering

```
netto_inntekt_øre = partnerens_CPA_øre × (1 − nettverksgebyr)
poeng            = floor(netto_inntekt_øre × brukerandel)        // 1 BP = 1 øre
bruttomargin     = netto_inntekt_øre − poeng
```

Eksempel: CPA 200 kr, nettverksgebyr 15 %, andel 30 % → netto 170 kr → **5 100 BP** (51 kr) til brukeren og 119 kr i bruttomargin.

### 2.2 Lønnsomhetsberegning før aktivering (obligatorisk)

Følgende må fylles ut og lagres som et uforanderlig øyeblikksbilde knyttet til kampanjen:

- partnerens CPA, nettverksgebyr, betalingsfrist og avtalereferanse
- forventet antall konverteringer, maks antall og budsjett i kroner
- forventet tilbakeføringsrate (reversering/chargeback)
- brukerandel (standard 30 %), poeng per konvertering (beregnet, ikke skrevet inn for hånd)
- forventet gavekortgebyr (0–3 % etter leverandør)

**Systemet nekter aktivering hvis:**
- brukerandelen overstiger taket i konfigurasjonen
- marginen etter forventede tilbakeføringer og gavekortgebyr er under minstemarginen (forslag: 50 % av netto)
- betalingsfrist eller avtalereferanse mangler
- budsjett eller maks antall mangler

### 2.3 Finansiering før poengene kan brukes

- Poeng fra en konvertering er **ventende** til partneren har bekreftet konverteringen *og* godkjenningsperioden er utløpt. Senere kan det i tillegg kreves at oppgjøret fra nettverket er mottatt.
- Hver BP-kreditt (EARN, BONUS, REFERRAL) skal ha en `funding_reference`: enten en konvertering med lagret økonomi, eller en budsjettpott med nok gjenværende saldo.
- Manuelle positive justeringer er bare tillatt som korrigering knyttet til en tidligere transaksjon, eller fra en egen «goodwill»-pott med månedstak. Begge er høyrisiko.

### 2.4 Rapport over poenggjeld (ledelsesnivå)

Rapporten viser utestående godkjente poeng i kroner, ventende og reservert poeng, poeng fordelt per finansieringskilde, margin per partner og kampanje, samt prognose for innløsning.

---

## 3. Belønning av vanlig aktivitet: hva som er bærekraftig

Utgangspunktet er ditt valg: aktivitet gir XP, nivåer og merker, som ikke koster penger. Analysen nedenfor viser hvilke **BP-belønninger for aktivitet** som likevel er bærekraftige. Det felles prinsippet er at kostnaden enten vokser i takt med inntekten, eller har et fast budsjettak.

| Modell | Hvordan | Kostnad | Vurdering |
|---|---|---|---|
| **A. XP, nivåer og merker** | Streak, spill og innlogging gir XP. Nivåene låser opp merker, profilutseende og tidlig tilgang til tilbud. | 0 kr | ✅ Standard. Ingen økonomisk risiko. |
| **B. Nivåmultiplikator på verifisert opptjening** | Høyt nivå gir f.eks. +1–3 prosentpoeng brukerandel på *verifiserte* konverteringer | Proporsjonal med inntekten, holder seg under taket | ✅ Anbefales. Belønner lojalitet uten poeng uten finansiering. |
| **C. Streakbonus som prosent av ukens verifiserte opptjening** | 7-dagers streak gir f.eks. +5 % av ukens verifiserte BP | Proporsjonal med inntekten | ✅ Anbefales. Ingen verifisert opptjening gir ingen bonus. |
| **D. Annonsefinansiert aktivitet** | Belønningsvideo eller sponset innhold. Brukeren får andel × faktisk målt annonseinntekt. | Proporsjonal, men lite per visning | 🟡 Gir lite: med eCPM rundt 7–13 USD (veiledende for Norden) blir det ca. 2–4 BP per visning ved 30 %. Bør vurderes for engasjement, ikke som hovedinntekt. |
| **E. Budsjettert engasjementspott** | Fast beløp per måned (f.eks. 1–2 kr per aktiv bruker) fordeles via ukentlige utfordringer, med harde tak per bruker | Fast og kjent markedsføringskostnad | ✅ Anbefales med tak. Føres som markedsføringskostnad (CAC/retensjon). |
| **F. Partnersponsede oppdrag** | Partneren betaler for engasjement (quiz, besøk, appinstallasjon) | Finansiert av partneren | ✅ Bra når partnere finnes (fase 2 og 7) |
| **G. Gratis premietrekninger** | Aktivitet gir lodd | Fast premiebudsjett | ⚠️ Krever juridisk vurdering etter pengespilloven før bruk |

**Anbefaling:** A ved lansering, B og C når partnerinntekten er i gang, og E med et lite budsjett når veksten er målbar. D og F kommer i senere faser. G venter på juridisk avklaring.

---

## 4. Gavekortleverandører for det norske markedet

Kilder er oppgitt nederst. Mange leverandørsider kunne ikke leses direkte, så punktene bygger på offentlig informasjon og **må bekreftes skriftlig** med leverandørene.

| Leverandør | Norske kort | API | Prising (offentlig info) | Minimum | Egnet for |
|---|---|---|---|---|---|
| **GoGift** (Nordisk) | Sterkest i Norden: SuperGavekortet (universal, 50–30 000 kr) og norske merker som Zalando, Clas Ohlson og Ticketmaster | Ja (post, SMS, e-post, CSV, API) | Ikke offentlig. API krever forhåndsbetaling eller godkjent kreditt. | Ukjent, be om tilbud | **Fase 1 (manuell)** og trolig fase 2 |
| **Tremendous** (USA) | Katalogeksport viser NOK-kort fra bl.a. adidas, Apple, H&M, Plantasjen, Naturkompaniet, Circle K og Nelly | Ja, godt dokumentert, sandkasse | Gavekort til pålydende. 3 % ved kortbetaling, 4–6 % for kontanter (ikke aktuelt). | Ingen | Automatisering i fase 2 |
| **Runa** (UK) | Norsk dekning ikke bekreftet. 2 000+ merker i ca. 30 land. | Ja, gratis implementering | Volumrabatter, rapportert opptil ~25 %. Merkevarer kan kreve godkjenning. | Ingen | Fase 2. Rabatt kan gi ekstra margin. |
| **Huuray** (DK, kontor i Asker) | Norsk katalog (bl.a. Zalando) | Ja, og white label | Pålydende, ingen abonnement eller minimum, volumrabatt på forespørsel | Ingen | Fase 1 og 2 |
| **Giftbit** (CA) | Norske kort siden mai 2025: adidas, CDON, JYSK, Plantasjen, Royal Design, Wolt | Ja, ingen API-avgift | Pålydende. 2,9 % ved kortbetaling, bankoverføring gratis. | Ingen | Alternativ i fase 2 |
| **Tango Card** (USA) | «Reward Link Norway» (valgfrie merker, NOK 5–20 000) | Ja | Ikke bekreftet | Ukjent | Alternativ |
| **Tillo** (UK) | Norge ikke bekreftet | Ja, solid | Enterprise-avtaler | Har minimum, 2–6 ukers onboarding | Senere ved stort volum |
| **Glede** (NO) | Digitalt Mastercard-gavekort, kan brukes overalt | Ja | 3 % per kort (minimum 25–30 kr). Mottakeren betaler gebyr etter 12 mnd. | — | ⚠️ Lite egnet: minimumsgebyret utgjør 25–30 % på et kort til 100 kr, og kortet ligner kontanter (hvitvaskingsregler). |

**Anbefaling:**
1. **Fase 1 (manuell):** Avtale med én nordisk leverandør med universalkort og norske merker (førstevalg GoGift, alternativt Huuray). Administrator kjøper i leverandørens portal og legger koden inn i BonusPlays sikre leveringssystem.
2. **Fase 2 (automatisk):** Be om norsk katalogeksport, rabattsats, betalingsmodell (forhåndsbetaling eller faktura i NOK), sandkasse, kodeformat, gyldighetstid og databehandleravtale (GDPR) fra GoGift, Tremendous, Runa og Huuray. Velg én hovedleverandør og én reserve.
3. **Ikke** start med Mastercard-baserte gavekort eller PayPal.

Spørsmål til alle leverandører: norsk katalog (CSV), rabatt per merke, minste og største pålydende, forhåndsbetaling og kreditt, faktura i NOK, gyldighet og vilkår for norske forbrukere, API-sandkasse, leveringstid, refusjon ved feil, DPA og hvor data lagres.

---

## 5. Administratormodell

| Rolle | Hvem | Kan |
|---|---|---|
| SUPER_ADMIN | Deg | Alt, men aldri behandle saker som gagner egen konto. Høyrisiko skjer via køen. |
| ADMIN (godkjenner) | Utpekes senere | Daglig drift. Kan godkjenne høyrisikohandlinger som en annen administrator har bedt om. |

**Høyrisikohandlinger** (listen er konfigurerbar):
- positive poengjusteringer
- endringer i økonomikonfigurasjonen
- aktivering av kampanjer med avvik fra standardandelen
- åpning av aktiveringsporter
- rolleendringer
- gavekortlevering over en terskel (forslag: 500 kr), første innløsning på en ny konto, og ordre for kontoer med risikoflagg
- masseoperasjoner

**Flyt:**
1. Handlingen opprettes som en *forespørsel* med begrunnelse og en før/etter-beregning. Ingenting utføres automatisk.
2. **Så lenge det bare finnes én administrator:** Du godkjenner manuelt i et eget steg, tidligst etter en avkjølingsperiode (forslag: 1 time). Godkjenningen krever ny MFA-bekreftelse og en kvittering for beløpet.
3. **Når det finnes to administratorer:** Den som ber om handlingen og den som godkjenner må være forskjellige personer.
4. Handlinger som gagner administratoren selv (egen konto, egne ordre, egne kampanjer) blokkeres alltid.

**Logging:** Alle administrative handlinger lagres i en append-only-logg, også lesing av persondata og eksporter. Loggen har en søkbar visning og kan eksporteres.

---

## 6. Faser, innhold og estimater

Estimatene er i **utviklertimer inkludert tester**, med usikkerhet på ±30 %. Rekkefølgen følger prioriteringene dine. Fase 0–5 utgjør en lanseringsklar MVP.

### Fase 0 — Sikkerhet og stabilitet *(prioritet 1)* · 120–160 t · 3–4 uker
- CI (GitHub Actions + PostgreSQL) som kjører typekontroll og alle tester
- Retting av den sårbare avhengigheten, ny `SECURITY_AUDIT.md`
- Trygg migrasjonsprosess: sperre `drizzle push` for V2 og lage en prosedyre for produksjonsmigrering
- Forbud mot selvbehandling i alle økonomiske flyter (tjenestelag og database)
- Kø for høyrisikohandlinger (§5) med avkjøling og MFA-bekreftelse
- MFA påkrevd for administratorer, kontrollert på serveren
- Clerk-webhooks (sletting, utestengning, e-postendring) med signaturverifisering
- Komplett admin-audit, inkludert lesing av persondata
- Distribuert rate limiting
- **Demo:** tilgang bare for godkjente testbrukere (V2-innlogging + liste over testere), banner med «TESTVERSJON – ingen ekte verdier», fjerning av offentlig demo-admin, og en test som beviser at demopoeng aldri kan nå V2 eller ekte premier. Eksisterende demofunksjoner skal fortsatt virke.

### Fase 1 — Bærekraftig poengøkonomi *(prioritet 2)* · 110–150 t · 3–4 uker
- Versjonert økonomikonfigurasjon (100 BP/kr, andel 30 %, tak, minstemargin)
- Finansieringsreferanse på alle kreditter, håndhevet i databasen
- Lønnsomhetsberegning og aktiveringsregler for kampanjer (§2.2)
- Poeng er ventende til finansieringen er bekreftet (§2.3)
- Rapport over poenggjeld
- Kostfelt på premier (pålydende, innkjøpspris, gebyr) og prisregel
- XP-bok, nivåer, merker og streak i V2, uten BP (modell A). Klargjøring for modell B og C.
- Tekst om «ingen utløp» i vilkår og UI

### Fase 2 — Integrasjon med inntektsgivende partnere *(prioritet 3)* · 110–150 t · 3–4 uker
- Kampanjemodell: partner, budsjett, tak, pause og knytning til lønnsomhetsberegningen
- Generisk postback-adapter for affiliatenettverk (f.eks. Adtraction, Awin) basert på dagens signerte callback-grense
- Én integrasjon med en undersøkelses- eller offerwall-leverandør (server-til-server)
- Én konvertering per bruker per tilbud (konfigurerbart for tilbud som kan gjentas)
- Import og avstemming av oppgjør fra nettverk (CSV)

### Fase 3 — Profesjonelt administrasjonssystem *(prioritet 4)* · 100–140 t · 2,5–3,5 uker
- Samlet adminskall: oversikt over nøkkeltall, brukersøk og sperring, rolleforespørsler, partnere, leverandører, risikosperrer, godkjenningskø, audit-visning og paginering overalt

### Fase 4 — Gavekort og belønningsbutikk *(prioritet 5)* · 80–110 t · 2–3 uker
- Sikker manuell levering: gavekortkoden krypteres (AES-256-GCM, nøkkel i hemmelighetslageret) og vises bare for eieren etter innlogging. Hver visning logges. Ordren kan kobles til leverandørens referanse.
- Innløsningsregler: kontoalder, minimum verifisert opptjening, tak per dag og måned, og hastighetskontroller
- Transaksjonell e-post: ordrestatus, «gavekortet ditt er klart» (uten koden i e-posten)
- Butikk-UX: kategorier, merkevarebilder (lisensierte), filtrering

### Fase 5 — Brukervennlighet, design og lanseringskrav *(prioritet 6)* · 90–120 t · 2,5–3 uker
- Dashboard for V2 etter spesifikasjonen, onboarding og retting av mobilnavigasjonen
- Tilgjengelighet (WCAG 2.1 AA) og forbedringer av PWA-en
- GDPR: dataeksport, sletting og anonymisering (med oppbevaringsregel for økonomidata), samtykkebanner og nytt samtykke ved nye vilkår
- Hjelpesenter og kontaktskjema for support

**➜ Lanseringsklar MVP (fase 0–5): 610–830 timer.**

### Fase 6 — Automatisering og AI *(prioritet 7)* · 110–150 t
- Automatisk gavekortlevering via leverandør-API. Skjer bare når alle disse holder: konto eldre enn X dager, verifisert opptjening over Y, lav risikoscore, beløp under terskel, dagsbudsjett ikke brukt opp og nok saldo hos leverandøren. Alt annet går til manuell kø.
- Regelmotor for svindel og varsling om avvik
- AI-assistanse til administrator (Claude API): sammendrag av konverterings- og ordresaker med risikobegrunnelse. Avgjørelsen tas alltid av et menneske.
- AI-supportassistent med overlevering til menneske

### Fase 7 — Markedsføring og vekst *(prioritet 8)* · 200–260 t
- Verving: kvalifisering ved første verifiserte konvertering, vervebonus finansiert av den vervedes inntekt, og kontroll mot misbruk
- Selvbetjent partnerportal og Stripe-finansiering av kampanjer
- Samtykkestyrt markedsføring (e-post og push), SEO-landingssider og partnerrapporter

**Totalt fase 0–7: ca. 920–1 240 timer.**

---

## 7. Kostnadsanslag

Alle beløp er anslag i NOK ekskl. mva. og må bekreftes med tilbud.

### 7.1 Utvikling, to modeller

| | Modell A: AI-assistert (Claude Code) + ekstern gjennomgang | Modell B: innleid utvikler |
|---|---|---|
| Hvem gjør jobben | Claude Code utvikler. Du godkjenner. En ekstern seniorutvikler går gjennom sikkerhets- og økonomikoden (≈ 15 % av timene). | Frilans- eller konsulentutvikler |
| Timepris (anslag) | 1 200–1 500 kr/t for den eksterne gjennomgangen | 1 100–1 500 kr/t |
| **MVP (fase 0–5)** | ≈ 110 000–190 000 kr + Claude-abonnement + din tid | ≈ 670 000–1 250 000 kr |
| Fase 6–7 | ≈ 55 000–90 000 kr | ≈ 340 000–615 000 kr |
| Kalendertid MVP | 12–16 uker (styres av dine godkjenninger og eksterne avklaringer) | 16–24 uker |

### 7.2 Engangskostnader før lansering (uavhengig av modell)

| Post | Anslag |
|---|---|
| Juridisk gjennomgang: vilkår, personvern, markedsføringsloven, gavekort og pengespill | 40 000–100 000 kr |
| Penetrasjonstest eller ekstern sikkerhetsrevisjon | 50 000–120 000 kr |
| Regnskap og revisor: oppsett for poenggjeld og gavekort | 10 000–30 000 kr |
| Forhåndsbetaling (float) hos gavekortleverandør | 10 000–25 000 kr (kapitalbinding, ikke kostnad) |

### 7.3 Driftskostnader per måned (tidlig fase, < 5 000 brukere)

| Post | Anslag |
|---|---|
| Hosting og administrert PostgreSQL | 500–2 000 kr |
| Clerk (innlogging, MFA) | 0–1 500 kr. Gratis nivå finnes, men MFA og produksjonsfunksjoner kan kreve betalt plan. Må verifiseres. |
| Transaksjonell e-post | 0–300 kr |
| Feilsporing og overvåking | 0–500 kr |
| Gavekortgebyr | 0–3 % av innløst verdi, etter leverandør |
| Claude API (AI-assistanse, fase 6) | Avhenger av volum, beregnes når funksjonen er designet |

---

## 8. Krav som må være oppfylt før lansering

- [ ] Fase 0–5 levert og alle tester grønne i CI
- [ ] Ekstern sikkerhetsrevisjon uten åpne høy- eller kritisk-funn
- [ ] Juridisk godkjente vilkår og personvernerklæring (inkludert «ingen utløp»)
- [ ] Minst én signert partneravtale med dokumentert CPA og betalingsfrist
- [ ] Signert avtale med gavekortleverandør og forhåndsbetalt float
- [ ] Økonomikonfigurasjonen godkjent av deg (andel, tak, minstemargin)
- [ ] Backup- og gjenopprettingsøvelse utført, og varsling aktiv
- [ ] Demoen er bare tilgjengelig for testere og er merket

---

## 9. Det jeg trenger fra deg for å starte

1. Godkjenning av planen (eventuelt med endringer i rekkefølge eller omfang).
2. Valg av utviklingsmodell (A eller B).
3. Bekreftelse av foreslåtte terskler: andelstak 40 %, minstemargin 50 % av netto, avkjøling 1 time og gavekortterskel 500 kr. De kan endres senere.
4. Tillatelse til å kontakte, eller at du selv kontakter, 2–3 gavekortleverandører med spørsmålene i §4.

---

### Kilder (gavekort og benchmark)
- Tremendous: [Pricing](https://www.tremendous.com/pricing/), [Gift card API](https://www.tremendous.com/gift-card-api/), [Catalog](https://www.tremendous.com/catalog/), [Catalog CSV](https://www.tremendous.com/catalog-csv)
- Runa: [Gift card API](https://runa.io/gift-card-api), [International gift cards](https://runa.io/international-gift-cards), [SelectSoftwareReviews](https://www.selectsoftwarereviews.com/reviews/wegift?5c87cf01_page=2)
- GoGift: [Bedrift](https://www.bedrift.gogift.com/), [SuperGavekortet](https://shop.gogift.com/no/no/nok/shop/supergavekortet-no/970282914398535680), [Gift card API](https://global.gogift.com/en/gift-card-api), [B2B-markedet i Norge](https://www.global.gogift.com/gift-card-markets-encyclopedia/the-ultimate-guide-to-the-b2b-gift-card-market-in-norway)
- Huuray: [Pricing](https://huuray.com/pricing/), [Norway gift card](https://huuray.com/products/norway-gift-card/)
- Giftbit: [Norway gift cards](https://www.giftbit.com/blog/norway-gift-cards), [Overview](https://www.giftbit.com/hubfs/Giftbit%20Overview.pdf)
- Tango Card: [Reward Link Norway](https://www.tangocard.com/reward-link/norway)
- Tillo: [Tillo](https://www.tillo.com/), [Foxreload review](https://foxreload.com/en/library/suppliers/tillo-gift-card-api-review-2026)
- Glede: [Bedrift](https://www.glede.app/bedrift), [Glede vs GoGift](https://www.glede.app/no/sammenligning/gogift), [Gebyrer](https://intercom.help/glede/nb/articles/10901071-gebyrer-knyttet-til-gavekortet)
- Annonsering (veiledende): [Rewarded ad benchmarks 2026](https://blog.playio.co/rewarded-ad-benchmarks-2026)
- Affiliate: [Nordiske affiliatenettverk](https://www.makeinfluence.com/en/academy/nordic-affiliate-networks-adtraction-tradedoubler-and-adservice-compared), [Awin cashback](https://help.awin.com/docs/cashback.md)
