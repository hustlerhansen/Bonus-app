import { Link, Redirect } from 'wouter';
import { useAuth } from '@clerk/react';
import { Building2, KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { Btn, Card, PageHead } from '@/components/bp';
import { PhaseNotice, V2Frame } from './shared';

export function V2Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/account" />;
  return (
    <V2Frame title="BONUSPLAY V2" desc="Verifiserte BONUSPLAY-kontoer for voksne i Norge. Fase 1: kontofundament.">
      <section className="rise py-8">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">V2 fase 1</div>
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">En ekte konto, <span className="grad-text">før noe annet</span></h1>
        <p className="mt-4 max-w-xl text-muted-foreground">Vi bygger BONUSPLAY steg for steg. Første steg er verifiserte kontoer for voksne i Norge, med tydelig samtykke og full kontroll over egen profil.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/sign-up"><Btn size="lg" variant="gold" shine data-testid="button-v2-signup">Opprett konto</Btn></Link>
          <Link href="/sign-in"><Btn size="lg" variant="ghost" data-testid="button-v2-signin">Logg inn</Btn></Link>
        </div>
      </section>
      <PhaseNotice />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          [UserCheck, 'Verifisert e-post', 'Kontoen knyttes til en bekreftet e-postadresse.'],
          [ShieldCheck, 'Samtykke med versjon', 'Vilkår og personvern godtas hver for seg, og versjonen lagres.'],
          [KeyRound, 'Passord og økter', 'Administrer passord og aktive økter under Sikkerhet.'],
          [Building2, 'Roller styres av server', 'Du kan ikke velge rolle selv. Tilganger settes av tjenesten.'],
        ].map(([I, t, d]) => {
          const Icon = I as typeof UserCheck;
          return <Card key={t as string}><Icon className="mb-3 h-6 w-6 text-primary" /><h3 className="font-display text-base">{t as string}</h3><p className="mt-1 text-sm text-muted-foreground">{d as string}</p></Card>;
        })}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">Vil du bare prøve spillene? <Link href="/" className="font-bold text-primary underline">Åpne demoen</Link>. Du må være 18 år eller eldre.</p>
    </V2Frame>
  );
}

export function BusinessPage() {
  return (
    <V2Frame title="For bedrifter" desc="Informasjon om fremtidig partnerskap med BONUSPLAY. Ikke aktivt i fase 1.">
      <PageHead eyebrow="For bedrifter" title="Partnerskap er ikke åpnet" sub="Denne siden er kun informasjon." />
      <PhaseNotice />
      <Card className="mt-6 space-y-3 text-sm text-muted-foreground">
        <p>Det finnes ingen partnerportal, ingen kampanjer og ingen fakturering i denne fasen. Vi tar ikke imot bestillinger, betaling eller kampanjemidler.</p>
        <p>Ingen partnere er knyttet til tjenesten i dag. Partnerroller kan bare tildeles av serveren, aldri ved registrering.</p>
        <p>Når og hvis partnerfunksjoner åpnes, vil vilkår, pris og personvernregler bli publisert her først.</p>
      </Card>
      <div className="mt-6"><Link href="/v2"><Btn variant="ghost">Tilbake til V2</Btn></Link></div>
    </V2Frame>
  );
}
