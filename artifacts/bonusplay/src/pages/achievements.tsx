import { Lock, Medal } from 'lucide-react';
import { Card, Empty, Meter, PageHead } from '@/components/bp';
import { useBpState } from '@/hooks/use-bp';

export default function AchievementsPage() {
  const s = useBpState();
  const un = s.achievements.filter((a) => a.unlocked).length;
  return (
    <>
      <PageHead eyebrow="Samling" title="Prestasjoner" sub={`${un} av ${s.achievements.length} låst opp`} />
      {s.achievements.length === 0 ? <Empty icon={<Medal />} title="Ingen prestasjoner" /> : (
        <div className="grid gap-3 sm:grid-cols-2">{s.achievements.map((a, k) => (
          <Card key={a.id} className={`rise flex gap-4 ${a.unlocked ? 'glass-glow' : ''}`} style={{ animationDelay: `${k * 0.04}s` }} data-testid={`card-achievement-${a.id}`}>
            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${a.unlocked ? 'btn-gold' : 'bg-white/8 text-muted-foreground'}`}>{a.unlocked ? <Medal className="h-7 w-7" /> : <Lock className="h-6 w-6" />}</div>
            <div className="min-w-0 flex-1"><div className="font-semibold">{a.title}</div><div className="mb-3 text-xs text-muted-foreground">{a.description}</div>
              <Meter value={a.progress} max={a.target} tone={a.unlocked ? 'gold' : 'electric'} /><div className="mt-1 text-[11px] tabular-nums text-muted-foreground">{Math.min(a.progress, a.target)} / {a.target}</div></div>
          </Card>))}</div>)}
    </>
  );
}
