# V2 tilbud og konverteringer — fase 3

Implementert i utvikling, **ikke aktivert**. Fase-1-portene (ekte e-postlevering, passord-/sesjonskontroller, produksjonskonfigurasjon, sikkerhetsfunn og valg av virkelig operatør/administrator) avklares separat. Ingen Stripe, live penger, demo-provider, faktisk partner eller oppdiktet kommersiell aktivitet er lagt til.

## Tilbud og start

- Administrator oppretter et uforanderlig utkast for en operatørkonfigurert partner. Tittel, kategori, beskrivelse, krav, steg, vilkår, serverbestemte BP, estimert tid, forventet vurderingstid, HTTPS-destinasjon og valgfri utløpsdato følger tilbudet.
- Tilbud må godkjennes før de vises til brukere. Godkjente tilbud kan avvises for å stoppe videre start og godkjenning av poeng. Avviste tilbud gjenåpnes ikke; endrede vilkår krever nytt tilbud. Alle opprettelser/beslutninger auditeres.
- Start krever åpen sikkerhetsport, aktiv konto, aktiv partner og godkjent, ikke utløpt tilbud. Konto, tidspunkt, klikk-ID og poengsnapshot kommer fra serveren. Nettleseren sender bare en UUID-forespørselsnøkkel.
- Samme startnøkkel gir samme klikk. Nøkkelen kan ikke gjenbrukes for en annen konto eller et annet tilbud. Klikket er uforanderlig og gir aldri poeng alene.
- Partnerlenken inneholder `bp_click=<UUID>`, ikke konto-ID, e-post, poeng eller signeringshemmelighet. UI forklarer sporing og ekstern destinasjon før start, og lar brukeren selv åpne lenken.
- Utløp stanser nye klikk, ikke behandling av klikk som allerede ble registrert innen fristen. Et eksplisitt avvist tilbud eller en deaktivert partner kan derimot ikke gi nye godkjente poeng.
- Partnerlogo er valgfri operatørkonfigurasjon. Ingen eksterne logobildeforepørsler eller valgfrie analyse-/markedsføringstrackere er aktivert av denne leveransen.

## Partnercallback

`POST /api/v2/offer-callbacks/{partnerId}`, `Content-Type: application/json`.

```json
{"eventId":"partnerens-unike-kilde-id","clickId":"serverens-klikk-uuid","status":"verified"}
```

Tillatte partnerstatuser: `pending`, `verified`, `rejected`. Ekstra felt, inkludert konto eller beløp, avvises.

Obligatoriske headere:

- `X-BP-Timestamp`: Unix-tid i sekunder, maks 300 sekunder gammel eller fremtidig.
- `X-BP-Nonce`: ny UUID for hvert HTTP-forsøk.
- `X-BP-Signature`: heksadesimal HMAC-SHA256 over **timestamp + "." + nonce + "." + eksakte rå JSON-bytes**, med den aktuelle partnerens hemmelighet.

Signaturen sjekkes med konstant-tids-sammenligning før JSON tolkes. Endret whitespace endrer signaturen. Callbackruten har egen rå-body-parser, rate limit og `no-store`; den ligger utenfor cookie-/Clerk- og browser-Origin-grensen. Den åpner ikke øvrige V2-ruter. En ukjent eller deaktivert partner gir 401; manglende/kort hemmelighet eller lukket port gir 503; dårlig/utløpt signatur gir 401.

Nonce er unik per partner og oppbevares uforanderlig med payloadhash, ikke rå persondata eller signeringshemmelighet. Gjenbrukt nonce gir 409. En partner kan prøve samme kildehendelse igjen med **ny nonce og ny signatur**: samme klikk/status returnerer samme konvertering uten dobbelt poeng. Feil som ruller tilbake lagrer heller ikke en nonce.

`(partnerId,eventId)` er globalt unik for partneren, og et klikk kan bare få én konvertering. Partneren kan ikke hevde andre partneres klikk. Et event-ID kan ikke flyttes til en annen bruker ved å sende et annet klikk. Begge begrensningene ligger også i PostgreSQL.

## Verifikasjon og poeng

1. Første gyldige partnerhendelse oppretter EARN **pending**, med klikkets serverkonfigurerte BP og ledgerkilde `offer:<partnerId>` + partnerens event-ID.
2. `pending` partnerbevis kan gå til `verified` eller `rejected`; terminalt partnerbevis kan ikke endres.
3. `verified` fra partner er **ikke** en saldoøkning. Administrator må vurdere og godkjenne konverteringen separat. Aktiv mottaker, godkjent tilbud, aktiv partner og signert `verified`-bevis kontrolleres på nytt.
4. Godkjenning bokfører samme opprinnelige beløp én gang og setter konverteringen til `verified`. Avvisning setter `rejected` og fjerner ventende poeng uten å endre saldo. Signert partneravvisning avviser ventende poeng automatisk.
5. Konvertering, poenghendelser, idempotens, callbackkvittering og audit bruker **samme** databasetransaksjon. Feil etter ledger-skriving ruller alt tilbake. Kontoer låses i sortert rekkefølge; samtidige callbackduplikater og konkurrerende godkjenning/avvisning gir én varig beslutning.

Betrodd aktør er **partnerens eksplisitt operatørkonfigurerte, aktive, lagrede ADMIN/SUPER_ADMIN-konto**. Det finnes ingen skjult systemaktør, browserrolle eller automatisk administrator. Poengmotorens eksisterende autorisasjon kjøres også fra callbacken. Deaktivering eller nedgradering av denne aktøren stanser behandling.

Generisk poengadmin kan ikke godkjenne/avvise eller kompensere tilbudstransaksjoner utenom konverteringskontrollen. En egen administratorflyt kan nå reversere allerede verifiserte konverteringer; se nedenfor.

## Reversering av godkjente tilbudspoeng

POST `/api/v2/admin/conversions/:conversionId/reverse` krever aktiv ADMIN/SUPER_ADMIN, aktiv mottaker, konkret `reason` (10–500 tegn) og `idempotencyKey` (16–128 tegn, bokstaver/tall/`_ . : -`). Ekstra felt avvises. Beløp, konto, aktør og kompensasjonstype bestemmes på serveren.

- Bare konverteringer med `status=verified` og terminalt `partner_status=verified` kan reverseres. En signert callback som forsøker å endre terminalt bevis til avvist gir fortsatt 409 uten noen økonomisk endring. Partneren kan ikke automatisk trekke tilbake godkjente poeng.
- Partnerbevis, opprinnelig poengtransaksjon og tidligere audithistorikk beholdes. Original poengtransaksjon får en `reversed`-hendelse med null saldoeffekt, mens en ny godkjent REVERSAL bokfører hele det motsatte beløpet.
- Konverteringen får status `reversed` og en egen uforanderlig `v2_offer_reversal_events`-hendelse med administrator, begrunnelse, tidspunkt og kompensasjonsreferanse. PostgreSQL beskytter terminalt partnerbevis og livsløp; utsatt konsistenskontroll krever en samsvarende full ledgerkompensasjon ved commit.
- Poeng, konvertering, begge audits, livsløpshendelse og idempotens lagres i samme transaksjon. Samtidige forsøk låser kontoer i sortert rekkefølge og deretter konverteringen. Én konvertering kan bare reverseres én gang.
- Samme nøkkel og normaliserte intensjon gir samme kompensasjon, `replayed=true` og **gjeldende** saldo. Endret administrator, konvertering eller begrunnelse med samme nøkkel gir 409. Intern nøkkel bruker et reservert, hashbasert tilbudsnavnerom. Ingen nøkkel eller audit beholdes etter et mislykket forsøk.
- Tilgjengelig saldo må dekke hele beløpet. Allerede brukte eller reserverte poeng kan ikke skape negativ saldo eller bruke en reservasjon. Handling som ikke kan dekkes avvises i sin helhet; samme nøkkel kan prøves igjen etter at saldo er tilstrekkelig eller reservasjonen er frigitt. Delvis reversering og gjelds-/negativ-saldo-modell støttes ikke.
- Korrigering av eksisterende økonomisk historikk krever **ikke** åpen opptjeningsport, aktiv partner eller fortsatt godkjent tilbud. Dette åpner ikke ny opptjening og endrer ingen sikkerhetsport. Administrator og mottaker må fortsatt være aktive.

Svaret inneholder `conversion`, `compensation`, `wallet` og `replayed`. Bruker og administrator ser «Tilbakeført», begrunnelsen og tidspunktet; administrator ser også aktør og kompensasjonsreferanse. Begrunnelsen vises til brukeren og må ikke inneholde sensitive personopplysninger. Admin krever eksplisitt bekreftelse av hele beløpet. Mutasjonen oppdaterer konverteringshistorikk og invaliderer både egen og administratorens saldo-/poenghistorikk.

## Tilgang og UI

Alle ordinære ruter arver Clerk-identitet, same-origin-mutasjoner, rate limiting, `no-store` og aktiv V2-konto. Demo-cookie autoriserer ikke V2.

| Rute | Tilgang |
|---|---|
| GET `/api/v2/offers`, `/offers/:offerId` | Aktiv konto; bare godkjente aktive tilbud |
| POST `/api/v2/offers/:offerId/start` | Egen konto; streng input uten beløp |
| GET `/api/v2/conversions` | Bare egen historikk |
| GET `/api/v2/admin/offer-partners`, `/admin/offers`, `/admin/conversions` | ADMIN/SUPER_ADMIN |
| POST `/api/v2/admin/offers` | ADMIN/SUPER_ADMIN; oppretter utkast |
| POST `/api/v2/admin/offers/:offerId/review` | ADMIN/SUPER_ADMIN; konkret begrunnelse |
| POST `/api/v2/admin/conversions/:conversionId/review` | ADMIN/SUPER_ADMIN; konkret begrunnelse |
| POST `/api/v2/admin/conversions/:conversionId/reverse` | ADMIN/SUPER_ADMIN; konkret begrunnelse og idempotens; kun godkjente konverteringer |

PARTNER-rollen har ingen administrator-/konverterings-/saldoautorisasjon. Selvbetjent partnerportal, selskaps-/kampanjeonboarding og finansiering tilhører senere faser.

Mobil-UI på norsk: `/account/offers`, `/account/offers/:offerId`, `/account/offers/admin`. Administrator kan lese krav, vilkår, destinasjon, mottaker og kildehenvisninger før beslutning. Start er synlig, men deaktivert når porten er lukket. Historikk oppdateres hvert 30. sekund; mutasjoner invaliderer relevante tilbud, konverteringer, saldo og transaksjonshistorikk. Lister er uttrykkelig begrenset til de siste 100; eldre historikk krever senere utvidelse, mens poengbokens egen paginerte historie beholdes.

## Operatørkonfigurasjon — ikke utført

`v2_earn_gate` opprettes med `phase1_cleared=false` og `earn_enabled=false`. Ingen nettleser-API kan endre disse. Før en operatør åpner porten må den separate fase-1-kontrollen være fullført og dokumentert i `clearance_reference`; PostgreSQL avviser aktivering uten klarering. En tekstverdi erstatter ikke faktisk verifikasjon.

En gjennomgått, auditerbar operatørendring må opprette en virkelig avtalt partner i `v2_offer_partners`: stabil ID, navn, valgfri logo, `secret_env_key`, `integration_actor_id`, og `active`. Hemmeligheten lagres gjennom prosjektets sikre hemmelighetsflyt, aldri i SQL-tabellen, dokumentasjon eller chat. Nøkkelnavnet må begynne med `V2_OFFER_CALLBACK_`, og hemmeligheten må være minst 32 tegn. Feltet er bare et nøkkelnavn; aktøren må allerede være en godkjent databaseadministrator. Ingen faktisk partner, hemmelighet eller virkelig aktør er valgt av implementasjonen.

Deaktiver opptjening med `earn_enabled=false` ved hendelser. Det stanser start, callbacks og godkjenning/avvisning av ventende konverteringer; historikk forsvinner ikke. Auditerte reverseringer av allerede godkjent historikk er fortsatt tilgjengelige. En partner kan også deaktiveres, og et tilbud avvises fra admin. Ikke slett finansielle records eller gjør negative «saldo-reparasjoner».

## Migrasjon og tester

Reverseringstestene dekker callback som forsøker å trekke tilbake godkjent bevis, duplikater, samtidige nøkler/callbacks/reservasjoner, brukte og reserverte kreditter, RBAC/deaktivering, normalisert idempotens, bevarte bevis, auditering, SQL-vern og atomisk rollback etter ledger-skriving. Ingen delvis kreditt eller negativ saldo tillates.

Verifisert i utvikling: typekontroll og tilbuds-, poeng-, tilgangs-, demo-finans- og frontend-cache-tester passerer. Én innlogget mobilnettleserkontroll bekreftet begrunnelse/bekreftelse, vellykket reversering, avvisning ved reserverte poeng, norsk historikk etter omlasting, korrekt poengsaldo og tilgangsavslag etter tilbakeføring av syntetisk testkonto til USER. Testpartneren er inaktiv, og porten forblir `phase1_cleared=false`, `earn_enabled=false`. Syntetisk testhistorikk beholdes som uforanderlig testdata; den er ikke ekte partneraktivitet. Lesende poengavstemming etter nettleserkontrollen rapporterte ingen avvik.

`0003_v2_offers.sql` og `0004_v2_offer_reversals.sql` bruker migrasjonsledger/checksum. Reverseringsmigrasjonen utvider statuskontrollen og legger til uforanderlige livsløpshendelser og konsistensvern; tidligere migrasjoner er uendret. Ingen oppstarts-DDL eller produksjonsmigrasjon.

```sh
pnpm --filter @workspace/db run migrate:dev
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server run test:v2-offers
pnpm --filter @workspace/api-server run test:v2-points
pnpm --filter @workspace/api-server run test:v2
pnpm --filter @workspace/api-server run test:demo-financial
pnpm --filter @workspace/bonusplay run test:v2-cache
```

Tilbudstestene bruker en isolert, midlertidig PostgreSQL-schema og syntetisk hemmelighet. Bare denne test-schemaen har åpen port. Testene dekker signatur/tampering/tid, nonce-replay, hendelses-/klikkduplikater, serverbeløp, partner-/kontoscoping, RBAC, aktørdeaktivering, pending/verified/rejected, approval-bypass, samtidighet, atomisk rollback, utløp og lukket port. Nettlesertest kan beholde eksplisitt syntetisk testhistorikk, men skal aldri åpne utviklingens port eller velge en virkelig administrator.
