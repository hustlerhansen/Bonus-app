import { Link } from 'wouter';
import { Flame, Gamepad2, Medal, ClipboardList, Users, Coins } from 'lucide-react';
import { Lock } from 'lucide-react';
import { Card, Meter, PageHead } from '@/components/bp';
import { useBpState } from '@/hooks/use-bp';
import { fmt } from '@/lib/format';

export default function ProfilePage() {
  const { user: u } = useBpState();
  const stats = [
    { i: Coins, l: 'Totalt tjent', v: fmt(u.totalPointsEarned) }, { i: Gamepad2, l: 'Spill spilt', v: fmt(u.gamesPlayed) },
    { i: ClipboardList, l: 'Undersøkelser', v: fmt(u.surveysCompleted) }, { i: Users, l: 'Aktive vervinger', v: fmt(u.activeReferrals) },
    { i: Medal, l: 'Prestasjoner', v: fmt(u.achievementsUnlocked) }, { i: Flame, l: 'Dagsrekke', v: `${u.streak} dager` },
  ];
  return (
    <>
      <PageHead eyebrow="Konto" title="Profil" />
      <Card glow className="mb-5 flex items-center gap-5">
        <div className="btn-electric font-display grid h-20 w-20 place-items-center rounded-[1.75rem] text-2xl">{u.displayName.slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><div className="font-display truncate text-xl" data-testid="text-displayname">{u.displayName}</div>
          <div className="text-xs text-muted-foreground">{u.role === 'admin' ? 'Admin (demo)' : 'Demobruker'} · Nivå {u.level}</div>
          <div className="mt-3"><Meter value={u.xp} max={u.xpTarget} /></div><div className="mt-1 text-xs tabular-nums text-muted-foreground">{fmt(u.xp)} / {fmt(u.xpTarget)} erfaring</div></div>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{stats.map((s) => (
        <Card key={s.l} className="p-4"><s.i className="h-5 w-5 text-primary" /><div className="font-display mt-3 text-xl tabular-nums">{s.v}</div><div className="text-xs text-muted-foreground">{s.l}</div></Card>))}</div>
      <h2 className="font-display mb-3 mt-6 text-lg">Nivåmerker</h2>
      <div className="grid grid-cols-3 gap-3">{[[10, 'Sølv', 'from-slate-300/40'], [25, 'Gull', 'from-amber-400/50'], [50, 'Diamant', 'from-cyan-300/40']].map(([lv, n, c]) => { const un = u.level >= (lv as number); return (
        <Card key={n as string} className={`bg-gradient-to-b ${c} to-transparent p-4 text-center ${un ? '' : 'opacity-70'}`} data-testid={`badge-level-${lv}`}>
          <Medal className={`mx-auto h-8 w-8 ${un ? 'text-amber-200' : 'text-muted-foreground'}`} /><div className="font-display mt-2">{n}</div><div className="text-[11px] text-muted-foreground">Nivå {lv}</div>
          <div className="mt-2 text-[11px] font-semibold">{un ? 'Opplåst' : <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Låst</span>}</div>
          {!un && <div className="mt-2"><Meter value={u.level} max={lv as number} /><div className="mt-1 text-[10px] text-muted-foreground">Nivå {u.level} av {lv}</div></div>}
        </Card>); })}</div>
      <div className="mt-5 flex flex-wrap gap-2 text-sm"><Link href="/achievements" className="bp-btn btn-ghost h-10 px-5">Prestasjoner</Link><Link href="/settings" className="bp-btn btn-ghost h-10 px-5">Innstillinger</Link></div>
    </>
  );
}
