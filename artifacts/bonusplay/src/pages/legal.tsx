import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { AlertTriangle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, PageHead } from '@/components/bp';

function Draft({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <>
      <PageHead eyebrow="Juridisk" title={title} sub={sub} />
      <div className="mb-5 flex gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100" data-testid="notice-legal-draft">
        <AlertTriangle className="h-5 w-5 shrink-0" /><span><b>Juridisk utkast for testing.</b> Teksten er ikke gjennomgått av jurist eller godkjent for kommersiell lansering. Demoen og V2-kontofundamentet har ingen ekte utbetalinger.</span>
      </div>
      <Card className="prose prose-invert max-w-none prose-headings:font-display prose-headings:text-base">{children}</Card>
    </>
  );
}

export function PrivacyPage() {
  return (
    <Draft title="Personvern" sub="Utkast til personvernerklæring for demoen.">
      <h2>Hva vi lagrer</h2><p>Demoen lagrer en signert øktinformasjon og kontostatus (poeng, erfaring, juveler, transaksjoner) knyttet til en demobruker. Du oppgir ingen navn, e-post eller betalingsinformasjon.</p>
      <h2>V2-kontoer</h2><p>V2 er et eget kontofundament for testing. Når du registrerer en V2-konto, behandles navn, e-post, land, språk, vervekode, kontostatus, innloggingsdatoer og tidspunkt/versjon for godtatte vilkår og personvern. Dette er ekte kontoopplysninger, ikke den forhåndsutfylte demoprofilen.</p>
      <h2>Eksterne leverandører</h2><p>Annonser, undersøkelser og tilbud er simulert. V2 bruker Clerk til innlogging, e-postbekreftelse, passord og økter. Disse opplysningene behandles hos innloggingsleverandøren; BONUSPLAY lagrer ikke passord. Behandlingsgrunnlag, ansvarlig selskap, kontaktinformasjon, leverandøravtaler og eventuell internasjonal overføring må avklares før kommersiell lansering.</p>
      <h2>Informasjonskapsler og lagring</h2><p>En øktinformasjonskapsel brukes for innlogging. Enkelte innstillinger lagres lokalt på enheten. Tjenestearbeideren cacher aldri API-svar.</p>
      <h2>Sletting</h2><p>Du kan tilbakestille eller avslutte demoøkten under Innstillinger. Dette sletter ikke en separat V2-konto. Automatisk dataeksport og slettingsforespørsler for V2 er ikke implementert ennå; bruk bare testopplysninger frem til disse funksjonene og den endelige personvernerklæringen er på plass.</p>
    </Draft>
  );
}
export function TermsPage() {
  return (
    <Draft title="Vilkår" sub="Utkast til bruksvilkår for demoen.">
      <h2>Demo</h2><p>BONUSPLAY er en demonstrasjon. Poeng, juveler og premier har ingen reell verdi, og ingen utbetalinger skjer.</p>
      <h2>V2-kontofundament</h2><p>Du kan opprette en separat verifisert konto for å teste innlogging og profil. Poengopptjening, innløsning, partnerkampanjer og betaling er ikke aktive i V2. Registrering gir ingen bonus eller rett til ekte belønninger. Gjeldende testversjon av vilkår og personvern vises i kontoregistreringen og lagres sammen med tidspunktet du godtok dem.</p>
      <h2>Aldersgrense</h2><p>Tjenesten er ment for voksne, 18 år og eldre.</p>
      <h2>Rettferdig bruk</h2><p>Serveren bestemmer alle beløp og daglige grenser. Forsøk på å manipulere belønninger kan føre til at økten avsluttes.</p>
      <h2>Endringer</h2><p>Vilkårene er et utkast og kan endres uten varsel.</p>
    </Draft>
  );
}
const faq = [
  ['Er pengene ekte?', 'Nei. Alt i BONUSPLAY er en demo. Premier og utbetalinger er simulerte.'],
  ['Hvorfor kan jeg ikke hente en belønning igjen?', 'Serveren styrer daglige grenser. Fullførte oppdrag kan ikke hentes på nytt samme dag.'],
  ['Hva er juveler?', 'Juveler er en egen valuta du bruker i arrangementer som Weekend Drop og for kister.'],
  ['Hvordan holder jeg dagsrekken?', 'Hent dagsbelønningen hver dag. Går du glipp av en dag, starter rekken på nytt.'],
  ['Hvordan tilbakestiller jeg demoen?', 'Gå til Innstillinger og velg Tilbakestill demo.'],
];
export function HelpPage() {
  return (
    <>
      <PageHead eyebrow="Støtte" title="Hjelp" sub="Svar på det vanligste. Appen er en demo." />
      <Card className="p-2"><Accordion type="single" collapsible>{faq.map(([q, a], i) => (
        <AccordionItem key={q} value={`i${i}`} className="border-white/8 px-3"><AccordionTrigger className="text-left font-semibold" data-testid={`faq-${i}`}>{q}</AccordionTrigger><AccordionContent className="text-muted-foreground">{a}</AccordionContent></AccordionItem>))}</Accordion></Card>
      <p className="mt-4 text-xs text-muted-foreground">Se også <Link className="underline" href="/privacy">personvern</Link> og <Link className="underline" href="/terms">vilkår</Link> (juridiske utkast).</p>
    </>
  );
}
