import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Flame, Gamepad2, Gem, Gift, Sparkles, Target, Trophy } from 'lucide-react';
import { useClaimDailyReward } from '@workspace/api-client-react';
import { AnimatedNumber, Btn, Card, Meter, Pts } from '@/components/bp';
import { applyResult, errMsg, isFlagOn, useBpState } from '@/hooks/use-bp';
import { useReward } from '@/components/reward-modal';
import { useToast } from '@/hooks/use-toast';
import { claimedToday, fmt, fmtPointsValue } from '@/lib/format';

export default function HomePage() {
  const s = useBpState();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { show } = useReward();
  const daily = useClaimDailyReward();
  const u = s.user;
  const done = claimedToday(s.lastDailyClaim);
  const completedDays = done && u.streak % 7 === 0 ? 7 : u.streak % 7;
  const streakMission = s.missions.find(m => m.id === 'mission-streak');
  const streakEnabled = streakMission?.enabled !== false;
  const dailyAmounts = [50, 75, 100, 125, 150, 200, streakMission?.points ?? 500];
  const nextDay = u.streak % 7 + 1;
  const target = u.xpTarget;
  const open = s.missions.filter((m) => !m.completed && m.enabled).slice(0, 3);
  const top = s.leaderboard.slice(0, 3);

  const claimDaily = () =>
    daily.mutate(undefined, {
      onSuccess: (r) => { applyResult(qc, r); show(r); },
      onError: (e) => toast({ title: 'Dagsbelønning', description: errMsg(e), variant: 'destructive' }),
    });

  return (
    <div className="space-y-5">
      <Card glow className="rise relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-gradient-to-br from-amber-400/30 to-orange-500/10 blur-2xl" />
        <div className="relative">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Din saldo (demo)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <AnimatedNumber value={u.points} className="font-display gold-text text-5xl sm:text-6xl" />
            <span className="text-lg font-semibold text-amber-200">poeng</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground" data-testid="text-points-value">{fmtPointsValue(u.points)} (100 poeng = 1 kr, kun demo)</div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
            <Mini icon={<Sparkles className="h-4 w-4 text-sky-300" />} l="Nivå" v={String(u.level)} />
            <Mini icon={<Flame className="h-4 w-4 text-orange-400" />} l="Dagsrekke" v={`${u.streak} dager`} />
            <Mini icon={<Gem className="h-4 w-4 text-fuchsia-300" />} l="Juveler" v={fmt(u.gems)} />
          </div>
          <div className="mt-5 sm:max-w-md">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground"><span>Nivå {u.level}</span><span className="tabular-nums">{fmt(u.xp)} / {fmt(target)} erfaring</span></div>
            <Meter value={u.xp} max={target} />
          </div>
        </div>
      </Card>

      <Card className="rise flex flex-col gap-4 sm:flex-row sm:items-center" style={{ animationDelay: '.08s' }}>
        <div className="flex-1">
          <div className="flex items-center gap-2 font-display text-lg"><Flame className="h-5 w-5 text-orange-400" />Dagsbelønning</div>
          <p className="mt-1 text-sm text-muted-foreground">{!streakEnabled ? 'Dagsbelønningen er midlertidig deaktivert i demoen.' : done ? 'Du har hentet dagens belønning. Kom tilbake i morgen for å holde dagsrekken.' : `Dag ${nextDay}: +${fmt(dailyAmounts[nextDay - 1])} poeng og +50 erfaring.`}</p>
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className={`flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold ${i < completedDays ? 'btn-gold' : i === nextDay - 1 && !done ? 'border border-amber-300/60 bg-amber-400/10 text-amber-200 shadow-[0_0_16px_#ffbe3330]' : 'bg-white/8 text-muted-foreground'}`}>
                <span>Dag {i + 1}</span>
                {i === 3 || i === 6 ? <Gift className="h-4 w-4" /> : <span>{dailyAmounts[i]}</span>}
                {(i === 3 || i === 6) && <span className="text-[8px]">{i === 3 ? 'Kiste' : 'Hovedpremie'}</span>}
              </span>
            ))}
          </div>
        </div>
        <Btn variant="gold" size="lg" shine loading={daily.isPending} disabled={done || !streakEnabled} onClick={claimDaily} data-testid="button-daily">{done ? 'Hentet i dag' : 'Hent dagsbelønning'}</Btn>
      </Card>

      <Link href="/events" data-testid="link-weekly-teaser" className="glass-glow rise block rounded-3xl border border-amber-300/25 bg-gradient-to-r from-amber-400/15 to-fuchsia-500/10 p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200">Ukens Challenge · gratis deltakelse</div>
        <div className="font-display mt-1 text-xl">10 000 kr premiepott <span className="text-sm text-muted-foreground">(DEMO)</span></div>
        <div className="mt-1 text-xs text-muted-foreground">Tjen spillpoeng og klatre på ukelisten. Ingen innsats, ingen ekte penger.</div>
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { h: '/missions', i: Target, l: 'Oppdrag', c: 'from-sky-500/30' },
          { h: '/games', i: Gamepad2, l: 'Spill', c: 'from-violet-500/30', f: 'GAMES' as const },
          { h: '/events', i: CalendarDays, l: 'Konkurranser', c: 'from-fuchsia-500/30', f: 'EVENTS' as const },
          { h: '/rewards', i: Gift, l: 'Premier', c: 'from-amber-400/30', f: 'REDEMPTIONS' as const },
        ].map((a, k) => (
          <Link key={a.h} href={a.h} data-testid={`link-quick-${a.h.slice(1)}`} style={{ animationDelay: `${0.12 + k * 0.05}s` }}
            className={`glass rise group relative overflow-hidden rounded-3xl bg-gradient-to-br ${a.c} to-transparent p-4 transition hover:-translate-y-1`}>
            <a.i className="h-7 w-7 transition group-hover:scale-110" />
            <div className="mt-6 font-display text-sm">{a.l}</div>
            {a.f && !isFlagOn(s, a.f) && <div className="text-[10px] text-amber-300">Avslått</div>}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-5">
        <Card className="md:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg">Neste oppdrag</h2><Link href="/missions" className="flex items-center gap-1 text-sm text-primary">Se alle<ArrowRight className="h-4 w-4" /></Link></div>
          {open.length === 0 ? <p className="text-sm text-muted-foreground">Alle tilgjengelige oppdrag er fullført i dag.</p> : (
            <ul className="space-y-2">
              {open.map((m) => (
                <li key={m.id}><Link href="/missions" data-testid={`link-mission-${m.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 transition hover:bg-white/10">
                  <div className="min-w-0"><div className="truncate font-semibold">{m.title}</div><div className="truncate text-xs text-muted-foreground">{m.description}</div></div>
                  <Pts value={m.points} />
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg">Toppliste</h2><Link href="/leaderboard" className="text-sm text-primary">Åpne</Link></div>
          <ol className="space-y-2">
            {top.map((e) => (
              <li key={e.rank} className={`flex items-center gap-3 rounded-2xl p-2.5 ${e.isCurrentUser ? 'bg-primary/20' : 'bg-white/5'}`}>
                <span className={`grid h-8 w-8 place-items-center rounded-xl font-display text-sm ${e.rank === 1 ? 'btn-gold' : 'bg-white/10'}`}>{e.rank}</span>
                <span className="flex-1 truncate text-sm font-medium">{e.name}</span><span className="text-xs tabular-nums text-muted-foreground">{fmt(e.points)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Trophy className="h-4 w-4" />{u.achievementsUnlocked} prestasjoner låst opp</div>
        </Card>
      </div>
    </div>
  );
}

function Mini({ icon, l, v }: { icon: React.ReactNode; l: string; v: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{l}</div><div className="mt-1 font-display text-sm tabular-nums">{v}</div></div>;
}
