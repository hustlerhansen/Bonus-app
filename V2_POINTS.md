# V2 poengbok — fase 2

Gjelder utviklingsmiljøet. Ingen penger, gavekort, Stripe, partnerbetalinger eller automatisk verving aktiveres. Tilbudsmodulen er bygget, men aktiveringsporten er lukket; se `V2_OFFERS.md`. Demoen og filmen er separate og uendret.

## Regnskapsmodell

- Nye V2-kontoer har null poeng. Ingen demokontoer eller demobalanser importeres.
- `v2_points_transactions` lagrer uforanderlig opphav, type, signert heltallsbeløp, referanse, aktør, beskrivelse og begrunnelse.
- Typene er EARN, REDEEM, REFERRAL, BONUS, ADJUSTMENT, REFUND, REVERSAL og EXPIRATION.
- `v2_points_events` lagrer uforanderlige hendelser: pending, approved, rejected og reversed. Nyeste hendelse bestemmer visningsstatus; historiske hendelser slettes eller oppdateres aldri.
- **Saldo** = summen av alle hendelsenes `delta`.
- **Reservert** = summen av alle `reserved_delta`. Ventende trekk reserverer beløpet med en gang.
- **Tilgjengelig** = saldo minus reservert. Både dette, saldo og reservasjoner må være ikke-negative.
- **Venter** = positive beløp med nyeste status pending. Ventende opptjening er ikke brukbar.
- **Opptjent totalt** = godkjente, ikke tilbakeførte EARN/REFERRAL/BONUS. Justeringer og refusjoner er ikke opptjening.
- **Brukt totalt** = godkjente, ikke tilbakeførte REDEEM-trekk. Refunderte trekk teller ikke. Dette er nettotall, ikke bruttovolum.
- Poeng har ingen fast NOK-verdi. Maksimalt absolutt beløp per transaksjon er 1 000 000 BP som sikkerhetsgrense, ikke en pris eller vekslingskurs.

Alle summer leses i én database-snapshot. Skriving låser aktør- og mottakerkonto i sortert rekkefølge, leser gjeldende rolle/status på nytt, og skriver transaksjon, hendelser, idempotens og før/etter-audit i samme PostgreSQL-transaksjon. Ingen mutable saldo finnes på kontoen.

## Livsløp og korrigering

Pending kan godkjennes eller avvises én gang. Godkjenning bokfører opprinnelig beløp og frigir eventuell reservasjon. Avvisning frigir reservasjonen uten å endre saldo.

REFUND gjelder et tidligere godkjent negativt trekk. REVERSAL gjelder et tidligere godkjent trekk eller kreditert beløp. Begge er full tilbakeføring; serveren beregner `-original.amount`. Originalen får en reversed-hendelse med null saldoeffekt, og en **egen** godkjent kompensasjonstransaksjon bokfører motsatt beløp. Dermed beholdes hele hendelseshistorikken og regnskapet summeres uten dobbeltføring.

En original kan bare kompenseres én gang, enten som refusjon eller reversering, også ved samtidige forespørsler. Kompensasjoner kan ikke kompenseres på nytt. Delvise refusjoner, automatisk utløpskjøring og kompensasjon av allerede brukte kreditter gjennom negativ saldo støttes ikke. Hvis en kreditert transaksjon ikke kan reverseres uten å bruke reserverte poeng eller skape negativ saldo, avvises hele handlingen uten statusskifte.

## Idempotens og opphav

- Alle mutasjoner krever en global `idempotencyKey` på 16–128 tegn (bokstaver, tall, `_ . : -`).
- Samme nøkkel og normaliserte intensjon gir samme transaksjons-ID og `replayed: true`. Returen viser gjeldende transaksjonsstatus og saldo, ikke et gammelt saldo-snapshot.
- Endret beløp, konto, handling, begrunnelse eller aktør med samme nøkkel gir 409.
- `(source, reference)` er globalt unik: et verifisert kilde-ID kan ikke bokføres igjen med en ny nøkkel eller annen mottaker.
- Feil/avviste forsøk rulles tilbake, inkludert nøkkel og audit. Samme intensjon kan prøves igjen etter at årsaken til feilen er rettet.

## API og tilgang

Alle ruter ligger under `/api/v2`. Eksisterende V2-grenser gjelder: Clerk-identitet, aktiv og registrert konto, same-origin mutasjoner, no-store og rate limiting. Demo-cookie gir ingen tilgang.

| Metode | Rute | Tilgang |
|---|---|---|
| GET | `/wallet` | Egen konto; ID tas fra autentisert identitet |
| GET | `/transactions?limit=20&cursor=...` | Egen historie |
| GET | `/admin/accounts/:accountId/wallet` | ADMIN/SUPER_ADMIN |
| GET | `/admin/accounts/:accountId/transactions` | ADMIN/SUPER_ADMIN |
| POST | `/admin/accounts/:accountId/adjustments` | ADMIN/SUPER_ADMIN; amount, reason, idempotencyKey |
| POST | `/admin/transactions/:transactionId/decision` | ADMIN/SUPER_ADMIN; status, reason, idempotencyKey |
| POST | `/admin/transactions/:transactionId/compensation` | ADMIN/SUPER_ADMIN; type, reason, idempotencyKey |

Mutasjoner validerer strengt og avviser ekstra felt. Aktør, rolle, statuskontroll, refusjonsbeløp og saldo er serverstyrte. Bare den uttrykkelige, auditerte administratorjusteringen tillater et administratorangitt beløp; brukeren har ingen poengmutasjon.

`createPointsLedger().execute({kind: "record", ...})` er en **intern serverintegrasjonsgrense**, ikke en HTTP-rute. Den krever en aktiv, lagret administratoraktør. Fase-3-integrasjonen bruker operatørkonfigurert aktør, serverbestemte beløp og unike partnerkilde-ID-er, aldri brukerens beløp. Den kan dele poengmotorens transaksjon med konverteringsskriving uten å omgå autorisasjon/audit. Kildeprefikset `offer:` krever konverteringskontrollen for beslutninger; generisk admin kan ikke omgå partnerbevis. Tilbudskompensasjon og nøkkelnavnerommet `offer-` er tilsvarende beskyttet. Den dedikerte konverteringsreverseringen bruker en separat intern ledgergrense som kontrollerer koblingen mellom verifisert konvertering, EARN, mottaker, beløp og partnerkilde. Generisk kompensasjon er fortsatt blokkert, også via den vanlige interne `execute`-grensen. Se `V2_OFFERS.md`. Ingen tilbud er aktivert, og butikk, vervekvalifisering og automatisk utløpspolicy er fortsatt ikke levert.

Historikk bruker nøkkelbasert paginering på monoton sekvens, nyeste først, maks 100 transaksjoner per side. Hendelsesforløpet følger med hver transaksjon. Brukersidene er `/account/points` og administratorens side `/account/points/admin`.

## Migrasjon og verifikasjon

`0004_v2_offer_reversals.sql` legger til egen reversed-livsløpshendelse for tilbud og kobler den til poengbokens fulle REVERSAL. Poengbokens eksisterende saldo-, reservasjon-, audit- og kompensasjonsregler er uendret. Historiske korrigeringer kan gjennomføres mens ny opptjening er stengt, uten å endre porten.

```sh
pnpm --filter @workspace/db run migrate:dev
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server run test:v2
pnpm --filter @workspace/api-server run test:v2-points
pnpm --filter @workspace/api-server run test:demo-financial
pnpm --filter @workspace/bonusplay run test:v2-cache
```

`0002_v2_points.sql` er additiv. Migrasjonskjøreren kontrollerer checksum og registrerer versjoner atomisk. Ingen oppstarts-DDL og ingen produksjonsmigrasjon er kjørt. Bruk migrasjonskjøreren, **ikke schema push**, for V2; SQL-migrasjonen inneholder uforanderlighetstriggere og finansielle CHECK-regler.

Finansielle tester bruker en unik PostgreSQL-schema som opprettes fra migrasjonene og fjernes etter testen. Normale kontoer og demo-data endres ikke. Nettlesertesting kan beholde eksplisitt syntetiske utviklingskontoer og deres uforanderlige testhistorikk; ikke slett eller presenter disse som ekte kundeaktivitet.

Fase-1-kontroller og valg av virkelig administrator håndteres separat. Denne poengboken er ikke bevis for gjennomført e-postlevering, produksjonsinnlogging eller lanseringsklarhet. Fase 3 skal ikke aktiveres før de tidligere adgangs- og sikkerhetsportene er avklart.

## Lesende avstemming og periodisk kontroll

`pnpm --silent --filter @workspace/api-server run points:reconcile` gir en JSON-rapport fra én REPEATABLE READ / READ ONLY-snapshot. Den kontrollerer:

- tillatte hendelsesforløp, delta ved godkjenning og opprettelse/frigivelse av reservasjoner;
- summer per transaksjon og ikke-negative løpende konto-/reservasjons-/tilgjengelig-saldoer;
- én full kompensasjon per original, samme konto, motsatt beløp, riktig reversed-kobling og ingen kompensasjon av kompensasjon;
- global opphavsdeduplisering og forespørselsnøkler;
- én auditdekning per hendelse (to hendelser ved kompensasjon), forespørsels-/aktør-/kontokobling og før/etter-saldo rekonstruert fra bokførte hendelser.

Rapporten inneholder avvikskoder, hashbaserte kontoreferanser, transaksjonsreferanser og eventuelle hendelses-/auditreferanser. Den eksporterer aldri identiteter, persondata, kilde-/forespørselsnøkler eller fritekst. Avvik krever operatørgjennomgang; ingen økonomiske korreksjoner, historikkendringer eller kontosperringer utføres.

API-serveren kjører kontrollen ved oppstart og hvert 15. minutt. Avvik og utilgjengelig kontroll varsles gjennom egne strukturerte error-loggkoder, med overlappsvern per prosess og på tvers av replikaer. Utgående varsling og overvåking av en stoppet server må kobles til driftsoppsettet før lansering. Operatørprosedyre, rapportformat, avvikskoder og exit-koder står i `RUNBOOK.md`.

Kontrollen krever ingen ny migrasjon og endrer ikke `0002_v2_points.sql` eller mutasjonsmotoren. `test:v2-points` tester lesemodus, samtidig skriving, overlappsvern, persondataminimering og deteksjon mot isolerte feilfixtures uten å endre økonomiske historikkrader.
