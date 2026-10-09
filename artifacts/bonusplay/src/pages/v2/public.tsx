import { Link, Redirect } from 'wouter';
import { useAuth } from '@clerk/react';
import { Building2, Coins, Gift, KeyRound, ShieldCheck, Target, Trophy, UserCheck } from 'lucide-react';
import { Btn, Card, PageHead } from '@/components/bp';
import { PhaseNotice, V2Frame } from './shared';

export function V2Landing() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/account" />;
  return (
    <V2Frame title="BONUSPLAY – belønning for det du gjør" desc="Tjen BonusPoints på verifiserte tilbud fra norske partnere og løs dem inn i gavekort. 100 BP = 1 kr.">
      <section className="rise py-8">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Norsk belønningsplattform · 18+</div>
        <h1 className="font-display text-3xl leading-tight sm:text-5xl">Få <span className="grad-text">gavekort</span> for ting du likevel gjør</h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">Prøv tjenester, handle og svar på undersøkelser hos partnerne våre. Du tjener BonusPoints når partneren har bekreftet handlingen, og løser dem inn i gavekort.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/sign-up"><Btn size="lg" variant="gold" shine data-testid="button-v2-signup">Opprett gratis konto</Btn></Link>
          <Link href="/sign-in"><Btn size="lg" variant="ghost" data-testid="button-v2-signin">Logg inn</Btn></Link>
        </div>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm"><Coins className="h-4 w-4 text-amber-300" /><b>100 BonusPoints = 1 kr</b><span className="text-muted-foreground">i gavekortverdi</span></div>
      </section>
      <PhaseNotice />
      <section className="mt-8" aria-labelledby="h-how">
        <h2 id="h-how" className="mb-4 font-display text-xl">Slik fungerer det</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            [Target, '1. Velg et tilbud', 'Se hva du får, hvor lang tid det tar og hvilke krav som gjelder, før du starter.'],
            [ShieldCheck, '2. Partneren bekrefter', 'Poengene vises som ventende og blir dine når handlingen er verifisert.'],
            [Gift, '3. Løs inn', 'Bytt poeng mot gavekort. Hver bestilling kontrolleres for din sikkerhet.'],
          ].map(([I, t, d]) => {
            const Icon = I as typeof Target;
            return <li key={t as string}><Card className="h-full"><Icon className="mb-3 h-6 w-6 text-primary" /><h3 className="font-display text-base">{t as string}</h3><p className="mt-1 text-sm text-muted-foreground">{d as string}</p></Card></li>;
          })}
        </ol>
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          [Trophy, 'Nivåer og streaks', 'Sjekk inn daglig, hold streaken og lås opp merker og nivåer.'],
          [KeyRound, 'Trygg konto', 'Bekreftet e-post, tydelige samtykker og full kontroll over egne data.'],
          [UserCheck, 'Poeng utløper ikke', 'Opptjente BonusPoints utløper ikke. Vilkårene står alltid tydelig.'],
          [Building2, 'Ingen skjulte kostnader', 'Gratis å bruke. Vi tjener penger når partnerne betaler for verifiserte resultater.'],
        ].map(([I, t, d]) => {
          const Icon = I as typeof UserCheck;
          return <Card key={t as string}><Icon className="mb-3 h-6 w-6 text-primary" /><h3 className="font-display text-base">{t as string}</h3><p className="mt-1 text-sm text-muted-foreground">{d as string}</p></Card>;
        })}
      </section>
      <p className="mt-8 text-xs text-muted-foreground">Du må være 18 år eller eldre. Inviterte testere kan åpne <Link href="/demo" className="underline">testversjonen</Link>.</p>
    </V2Frame>
  );
}

export function BusinessPage() {
  return (
    <V2Frame title="For bedrifter" desc="Betal for verifiserte resultater. Partnerskap med BONUSPLAY.">
      <PageHead eyebrow="For bedrifter" title="Betal bare for verifiserte resultater" sub="Vi åpner for de første partnerne i lukket oppstart." />
      <PhaseNotice />
      <Card className="mt-6 space-y-3 text-sm text-muted-foreground">
        <p>BONUSPLAY kobler bedrifter med voksne forbrukere i Norge. Du betaler per verifisert handling (kjøp, abonnement eller registrering), ikke for visninger.</p>
        <p>Hver kampanje har budsjett og tak, og konverteringer bekreftes med signerte meldinger før brukeren får poeng.</p>
        <p>Selvbetjent partnerportal kommer senere. I oppstarten avtaler vi kampanjer direkte. Vilkår og pris avtales skriftlig.</p>
      </Card>
      <div className="mt-6"><Link href="/"><Btn variant="ghost">Til forsiden</Btn></Link></div>
    </V2Frame>
  );
}
