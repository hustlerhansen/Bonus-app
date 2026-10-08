# V2 premier — fase 4

Implementert i utvikling, **ikke kommersielt aktivert**. Demo, film, Stripe og produksjonsdatabasen er ikke endret av denne fasen. Ingen leverandører, premier, priser eller avtaler seeds.

## Katalog og godkjenning

En operatør må først konfigurere en faktisk leverandør i `v2_reward_suppliers`, med avtaledokumentets tekniske referanse og en eksplisitt aktiv, databasekontrollert ADMIN/SUPER_ADMIN som integrasjonsaktør. Ikke bruk demo-provider, oppdiktede merkenavn eller en automatisk systemrolle. Aktøren valideres av poengmotoren ved hver reservasjon.

Administrator kan deretter opprette et uforanderlig utkast med faktisk SKU, tittel, beskrivelse, vilkår, serverpris i BP, godkjenningsreferanse og operatørbekreftet lager. Godkjenning/deaktivering krever begrunnelse og audit. Endrede vilkår, pris eller nytt lager krever en ny definisjon; historiske bestillinger beholder opprinnelig pris og poengreferanse. Kun godkjente premier fra aktive leverandører vises til brukeren. Utsolgte premier kan leses, men ikke bestilles.

## To separate porter

Innløsning og utsending krever begge:

- `v2_earn_gate.phase1_cleared=true` og en konkret sikkerhetsreferanse;
- `v2_redeem_gate.enabled=true` og en konkret kommersiell referanse;
- godkjent premie og aktiv leverandør; aktiv bruker og administrator/integrasjonsaktør;
- ingen operatørregistrert `v2_reward_risk_blocks` for brukeren.

Den nye porten opprettes lukket. Ingen HTTP-rute eller skjerm kan åpne porten, endre roller, opprette leverandører eller oppheve risikosperrer. Avtalene, økonomien, juridiske krav og de separate sikkerhetskontrollene må faktisk godkjennes før en reviewed operatørhandling åpner den. Levering/refusjon av allerede påbegynte bestillinger kan avklares også når porten senere lukkes.

## Atomisk livsløp

| Ordrestatus | Poengbok | Lager |
|---|---|---|
| reserved | pending REDEEM, hele serverprisen reservert | én enhet reservert |
| delivering | approved REDEEM, reservasjonen frigitt og hele beløpet trukket | enheten fortsatt utilgjengelig |
| uncertain | trekket beholdes mens leverandørutfallet avklares | enheten fortsatt utilgjengelig |
| delivered | opprinnelig godkjent trekk beholdes | enheten brukt |
| refunded før utsending | pending avvises; reservasjonen frigjøres uten kredittransaksjon | enheten tilbake |
| refunded etter utsending | original reversed + egen full approved REFUND | enheten tilbake |

Saldo kommer utelukkende fra eksisterende append-only V2-poengbok. Reservasjon, lager, ordre, idempotens og audit skrives i samme PostgreSQL-transaksjon. En feil etter poengskriving ruller hele operasjonen tilbake. Ingen negativ tilgjengelig saldo, dobbeltreservasjon eller delvis refusjon.

Alle kommersielle skrivinger bruker én transaksjonslås før sorterte kontolåser og poengmotorens låser. Dette er en bevisst konservativ løsning for første manuelle lansering, ikke en skalerbar leveringsplattform. Andre poengskrivinger bruker fortsatt eksisterende kontolåser. Lagerets total er uforanderlig; tilgjengelig lager skal være total minus alle ikke-refunderte bestillinger.

## Levering er manuell — ingen skjult provider

Operatøren markerer utsending **før** leverandørhandlingen utføres. Ordre-UUID er den stabile eksterne referansen. En replay eller en annen administrator kan ikke starte samme bestilling på nytt. Køen viser konto-ID, leverandør-ID og SKU til administrator, ikke til andre brukere. Faktisk leveringskanal, mottakeridentifikasjon og leverandørens godkjente prosedyre må være avklart i avtalen før aktivering; API-et sender ikke gavekort, e-post eller penger.

Ved timeout/ukjent leverandørutfall brukes `uncertain`, aldri automatisk refusjon eller automatisk ny utsending. Administrator undersøker utfallet ved hjelp av ordre-ID. `delivered` krever dokumentert levering; `refund` krever konkret bevisreferanse, begrunnelse og uttrykkelig `confirmedNotDelivered=true`. Refusjon betyr at operatøren har bekreftet at premien ikke er levert og at lagerenheten kan frigjøres. Leverte eller allerede refunderte ordre kan ikke refunderes igjen. Opprinnelig trekk kan ikke godkjennes/refunderes gjennom den generiske poengadminruten.

Refusjon/frigivelse kan utføres når mottakeren er suspendert etter bestilling, men krever fremdeles en aktiv administrator. Dette smale interne unntaket gir ikke brukeren eller vanlige adminjusteringer noen utvidet tilgang.

## Idempotens og tilgang

Brukerens UUID-nøkkel bindes til autentisert konto og premie. Administratorens UUID bindes til aktør, ordre, handling, normalisert begrunnelse, bevisreferanse og ikke-leveringsbekreftelse. Nøkkelkonflikt gir 409. Samme nøkkel returnerer gjeldende ordre også når lager er tomt eller porten er lukket; konto-/rollekontroll omgås aldri. Alle nøkkelregistreringer er append-only.

Mobilklienten beholder innløsningsnøkkelen i konto-/premiespesifikk sessionStorage til svaret er bekreftet. «Hent resultat av tidligere forsøk» fungerer også dersom en tidligere reservasjon nå har brukt opp tilgjengelig saldo/lager. Bestillingshistorikken er den varige oversikten etter tap av nettleserøkten. Administratornøkler er aktør-/ordre-/handlingsspesifikke; ved usikkert svar skal samme begrunnelse og bevisreferanse brukes. Serveren bestemmer konto, pris, saldo, lager og refusjonsbeløp.

Alle ruter bruker eksisterende Clerk-identitet, V2-registrering, same-origin-mutasjoner, rate limiting, no-store og databasekontrollerte roller. Demo-cookie gir ingen tilgang. Historikk er eierskapsavgrenset. Admin gir ikke brukeren en vei til å oppgi eget poengbeløp.

## API og skjermer

- Bruker: `GET /api/v2/rewards`, `GET /api/v2/rewards/:rewardId`, `POST /api/v2/rewards/:rewardId/redeem`, `GET /api/v2/orders`.
- Admin: `GET /api/v2/admin/reward-suppliers`, `GET/POST /api/v2/admin/rewards`, `POST /api/v2/admin/rewards/:rewardId/review`, `GET /api/v2/admin/orders`, `POST /api/v2/admin/orders/:orderId/action`, `GET /api/v2/admin/rewards/reconciliation`.
- Norske mobile skjermer: `/account/rewards`, `/account/rewards/:rewardId`, `/account/orders`, `/account/rewards/admin`.
- OpenAPI er kontrakten. Genererte Zod-validatorer og React Query-hooks er regenerert, ikke håndredigert. Vellykkede mutasjoner oppdaterer katalog, detalj, saldo, poenghistorikk, ordrehistorikk, leveringskø og avstemming. Historikk/kø oppdateres hvert 30. sekund mens siden er åpen.

## Avstemming

Administrators avstemming leser én REPEATABLE READ / READ ONLY-snapshot. Den skriver ingen korreksjoner eller audit. Den kontrollerer:

- lager mot alle ikke-refunderte bestillinger (`STOCK_MISMATCH`);
- ordre-eierskap, serverpris, transaksjonstype, kilde-/ordreidentitet, status og tilhørende full godkjent refusjon (`ORDER_LEDGER_MISMATCH`);
- premie-REDEEM uten ordre (`ORPHAN_REDEMPTION`).

Rapporten inneholder bare avvikskode og teknisk premie-/ordre-/transaksjonsreferanse, ingen identitet, leveringsbevis eller fritekst. Den eksisterende poengkontrollen kontrollerer hendelseseffekter, saldo, audit og kompensasjon. Avvik håndteres av operatør; ingen automatisk økonomisk «reparasjon». Leverandørens egne leveringsregistre må fortsatt sammenholdes manuelt med ordre-ID og audit.

## Migrasjon og tester

`0004_v2_rewards.sql` er additiv og inneholder lager-/pris-CHECK, fremmednøkler og immutabilitetstriggere. Bruk `migrate:dev`, ikke schema push. Ingen produksjonsmigrasjon.

```sh
pnpm --filter @workspace/db run migrate:dev
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server run test:v2-rewards
pnpm --filter @workspace/api-server run test:v2-points
pnpm --filter @workspace/api-server run test:v2-offers
pnpm --filter @workspace/api-server run test:v2
pnpm --filter @workspace/api-server run test:demo-financial
pnpm --filter @workspace/bonusplay run test:v2-cache
```

13 isolerte PostgreSQL-premietester består: lukkede porter, roller, serverpris, uforanderlige vilkår, duplikater, parallell saldo/lager, rollback og retry, risikosperre, leverandørstans, suspensjon, lukket port ved opprydding, levering/usikkert utfall/full refusjon, samtidige terminalutfall, generisk-poengbypass, avstemmingsavvik og injiserte skrivefeil etter poengskriving og under refusjon. Syntetiske leverandører og åpen aktivering brukes kun i isolerte testskjemaer som slettes etterpå. Vanlige/demo-kontoer og økonomisk historikk endres ikke av disse testene.

Nettleserbevis og gjenværende lanseringsporter føres i `CURRENT_STATE.md`. Implementert funksjon er ikke bevis for godkjent leverandøravtale eller lanseringsklarhet.
