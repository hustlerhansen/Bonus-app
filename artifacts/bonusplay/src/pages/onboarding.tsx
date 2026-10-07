import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Coins, Gamepad2, ShieldCheck, Trophy, UserRound, Wrench } from 'lucide-react';
import { Link } from 'wouter';
import { getGetBonusplayStateQueryKey, useStartDemoSession } from '@workspace/api-client-react';
import { Btn, Logo } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { useToast } from '@/hooks/use-toast';

const slides = [
  { icon: Gamepad2, tone: 'btn-electric', title: 'Spill og utforsk', text: 'Prøv tre raske spill, daglige oppdrag og arrangementer. Alt du gjør telles opp av serveren, aldri av appen.' },
  { icon: Coins, tone: 'btn-gold', title: 'Tjen poeng', text: 'Fullfør oppdrag, se korte demoannonser, svar på undersøkelser og spill for å samle poeng og erfaring.' },
  { icon: Trophy, tone: 'btn-electric', title: 'Lås opp belønninger', text: 'Stig i nivå, hold dagsrekken i live, klatre på topplisten og delta i Ukens Challenge uten kostnad.' },
  { icon: ShieldCheck, tone: 'btn-gold', title: 'Få belønninger', text: 'Bytt poeng mot demopremier. DEMO: ingen ekte penger eller utbetalinger. Du må være 18 år eller eldre for å bruke tjenesten.' },
];

export default function Onboarding() {
  const [i, setI] = useState(0);
  const [login, setLogin] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const start = useStartDemoSession();

  const go = (role: 'user' | 'admin') =>
    start.mutate({ data: { role } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBonusplayStateQueryKey() }),
      onError: (e) => toast({ title: 'Innlogging feilet', description: errMsg(e), variant: 'destructive' }),
    });

  const S = slides[i];
  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden px-6 pb-8 pt-8">
      <div className="pointer-events-none absolute -right-24 top-24 h-72 w-72 animate-floaty rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 animate-floaty rounded-full bg-primary/25 blur-3xl" style={{ animationDelay: '-2s' }} />
      <div className="relative flex items-center justify-between"><Logo />
        {!login && <button className="text-sm text-muted-foreground" onClick={() => setLogin(true)} data-testid="button-skip">Hopp over</button>}
      </div>

      <div className="relative flex flex-1 flex-col justify-center">
        <AnimatePresence mode="wait">
          {!login ? (
            <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }}>
              <div className={`${S.tone} animate-floaty mb-8 grid h-28 w-28 place-items-center rounded-[2rem]`}><S.icon className="h-14 w-14" /></div>
              <h1 className="font-display text-3xl leading-tight">{S.title}</h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground" data-testid="text-slide">{S.text}</p>
            </motion.div>
          ) : (
            <motion.div key="login" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="font-display text-3xl leading-tight">Logg inn på <span className="grad-text">demoen</span></h1>
              <p className="mt-3 text-muted-foreground">Ingen passord eller personopplysninger trengs. Du får en forhåndsutfylt demokonto med 12 450 poeng.</p>
              <Btn size="lg" variant="gold" shine className="mt-8 w-full" loading={start.isPending && start.variables?.data.role === 'user'} disabled={start.isPending}
                icon={<UserRound className="h-5 w-5" />} onClick={() => go('user')} data-testid="button-login-user">Fortsett som demobruker</Btn>
              <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-white/10" />Kun for demonstrasjon<span className="h-px flex-1 bg-white/10" /></div>
              <Btn variant="ghost" className="w-full" loading={start.isPending && start.variables?.data.role === 'admin'} disabled={start.isPending}
                icon={<Wrench className="h-4 w-4" />} onClick={() => go('admin')} data-testid="button-login-admin">Admin-demo (signert adminøkt)</Btn>
              <p className="mt-3 text-center text-xs text-muted-foreground">Admin-valget er en eksplisitt demoinnlogging for å vise administrasjonsverktøy.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        {!login && (
          <>
            <div className="mb-5 flex gap-2">{slides.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'btn-electric w-8' : 'w-3 bg-white/15'}`} />)}</div>
            <Btn size="lg" className="w-full" icon={<ArrowRight className="h-5 w-5" />} data-testid="button-next"
              onClick={() => (i < slides.length - 1 ? setI(i + 1) : setLogin(true))}>{i < slides.length - 1 ? 'Neste' : 'Kom i gang'}</Btn>
          </>
        )}
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          <Link href="/terms" className="underline">Vilkår</Link> · <Link href="/privacy" className="underline">Personvern</Link> · <Link href="/help" className="underline">Hjelp</Link>
        </p>
      </div>
    </div>
  );
}
