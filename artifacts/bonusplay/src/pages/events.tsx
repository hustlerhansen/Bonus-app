import { useEffect, useRef, useState } from 'react';
import { Box, Crown, Gem, Package, Timer } from 'lucide-react';
import { Link } from 'wouter';
import { Card, FeatureOff, Meter, PageHead } from '@/components/bp';
import { ClaimButton } from '@/components/claim-button';
import type { EventProgress } from '@workspace/api-client-react';
import { isFlagOn, useBpState } from '@/hooks/use-bp';
import { fmt, fmtClock } from '@/lib/format';

const chests = [
  { id: 'chest-bronze', name: 'Bronse', tone: 'from-orange-700/60 to-amber-800/20', icon: Box, c: 'text-orange-300' },
  { id: 'chest-silver', name: 'Sølv', tone: 'from-slate-400/50 to-slate-600/10', icon: Package, c: 'text-slate-200' },
  { id: 'chest-gold', name: 'Gull', tone: 'from-amber-400/60 to-orange-500/15', icon: Package, c: 'text-amber-300' },
  { id: 'chest-diamond', name: 'Diamant', tone: 'from-cyan-400/50 to-fuchsia-500/20', icon: Crown, c: 'text-cyan-200' },
];

function EventCard({ e, on }: { e: EventProgress; on: boolean }) {
  const [left, setLeft] = useState(e.secondsRemaining);
  const end = useRef(0);
  useEffect(() => {
    end.current = Date.now() + e.secondsRemaining * 1000;
    setLeft(e.secondsRemaining);
    const t = setInterval(() => setLeft(Math.max(0, Math.round((end.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [e.secondsRemaining]);
  const pct = Math.round((e.gems / Math.max(1, e.target)) * 100);
  return (
    <Card glow className={`relative overflow-hidden p-6 sm:p-8 ${on ? '' : 'opacity-60'}`} data-testid={`card-event-${e.id}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-fuchsia-500/30 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-lg">{e.title}</div>
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 font-display text-sm tabular-nums" data-testid={`text-event-timer-${e.id}`}><Timer className="h-4 w-4 text-amber-300" />{left > 0 ? fmtClock(left) : 'Avsluttet'}</div>
      </div>
      <div className="relative mt-6 flex items-center gap-4"><Gem className="h-12 w-12 animate-floaty text-fuchsia-300" /><div><div className="font-display text-4xl"><span className="gold-text tabular-nums">{fmt(e.gems)}</span><span className="text-xl text-muted-foreground"> / {fmt(e.target)}</span></div><div className="text-sm text-muted-foreground">juveler samlet, {pct} % av målet</div></div></div>
      <div className="relative mt-5"><Meter value={e.gems} max={e.target} tone="gold" /></div>
    </Card>
  );
}

const tiers = [['1. plass', '2 000 kr'], ['2. plass', '1 000 kr'], ['3. plass', '500 kr'], ['4.–10. plass', '250 kr hver']];

function WeeklyChallenge() {
  const s = useBpState();
  const gOn = isFlagOn(s, 'GAMES'), lOn = isFlagOn(s, 'LEADERBOARDS'), eOn = isFlagOn(s, 'EVENTS');
  const week = s.leaderboards.week ?? [];
  const me = week.find((r) => r.isCurrentUser);
  return (
    <Card glow className={`relative mb-4 overflow-hidden p-6 sm:p-8 ${eOn ? '' : 'opacity-60'}`} data-testid="card-weekly-challenge">
      <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-amber-400/25 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2"><span className="btn-gold rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest">Gratis deltakelse</span><span className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Demo</span></div>
        <h2 className="font-display mt-3 text-2xl">UKENS CHALLENGE</h2>
        <div className="font-display gold-text mt-1 text-4xl">10 000 kr <span className="text-base text-muted-foreground">premiepott (DEMO)</span></div>
        <p className="mt-3 text-sm text-muted-foreground">Ingen innsats og ingen betaling. Du er med automatisk når du tjener spillpoeng i spillene. Flest poeng i uken gir høyest plassering. Alle beløp er demo og utbetales aldri.</p>
        <table className="mt-4 w-full max-w-sm text-sm" data-testid="table-prize-tiers"><tbody>{tiers.map(([p, a]) => <tr key={p} className="border-t border-white/10"><td className="py-2">{p}</td><td className="py-2 text-right font-semibold tabular-nums">{a} <span className="text-[10px] text-muted-foreground">DEMO</span></td></tr>)}</tbody></table>
        <div className="mt-4 rounded-2xl bg-black/25 p-4" data-testid="text-my-week-rank">
          <div className="text-xs text-muted-foreground">Din plassering denne uken</div>
          {!lOn ? <div className="text-sm text-amber-300">Topplisten er avslått.</div> : me ? <div className="font-display text-xl">Plass {me.rank} · {fmt(me.points)} poeng</div> : <div className="text-sm">Du er ikke på ukelisten ennå. Spill for å komme med.</div>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {gOn ? <Link href="/games" className="bp-btn btn-gold h-11 px-6" data-testid="link-challenge-games">Spill nå</Link> : <span className="text-sm text-amber-300">Spill er avslått.</span>}
          {lOn && <Link href="/leaderboard" className="bp-btn btn-ghost h-11 px-6" data-testid="link-challenge-leaderboard">Se resultatlisten</Link>}
        </div>
      </div>
    </Card>
  );
}

export default function EventsPage() {
  const s = useBpState();
  const events = s.events && s.events.length > 0 ? s.events : [s.event];
  const evOn = isFlagOn(s, 'EVENTS');
  const chOn = isFlagOn(s, 'CHESTS');
  return (
    <>
      <PageHead eyebrow="Arrangement" title="Konkurranser" sub="Samle juveler sammen med alle andre spillere før tiden går ut. Demo." />
      {!evOn && <div className="mb-4"><FeatureOff name="Arrangementer" /></div>}
      <WeeklyChallenge />
      <div className="space-y-4">{events.map((e) => <EventCard key={e.id} e={e} on={evOn} />)}</div>

      <h2 className="font-display mb-3 mt-8 text-xl">Kister</h2>
      {!chOn && <div className="mb-3"><FeatureOff name="Kister" /></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {chests.map((c, k) => (
          <Card key={c.id} className={`rise flex flex-col items-center bg-gradient-to-b ${c.tone} text-center`} style={{ animationDelay: `${k * 0.06}s` }} data-testid={`card-${c.id}`}>
            <c.icon className={`animate-floaty h-14 w-14 ${c.c}`} style={{ animationDelay: `${-k}s` }} />
            <div className="font-display mt-3">{c.name}</div>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">Innhold bestemmes av serveren.</p>
            <ClaimButton activityId={c.id} label="Åpne kiste" disabled={!chOn} className="mt-auto w-full" />
          </Card>))}
      </div>
    </>
  );
}
