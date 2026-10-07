import { useState } from 'react';
import { Crown } from 'lucide-react';
import { Card, Empty, FeatureOff, PageHead } from '@/components/bp';
import { isFlagOn, useBpState } from '@/hooks/use-bp';
import { fmt } from '@/lib/format';

const periods = [{ k: 'day', l: 'I dag' }, { k: 'week', l: 'Uke' }, { k: 'month', l: 'Måned' }] as const;

export default function LeaderboardPage() {
  const s = useBpState();
  const [p, setP] = useState<(typeof periods)[number]>(periods[2]);
  const rows = s.leaderboards[p.k] ?? [];
  const podium = rows.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  return (
    <>
      <PageHead eyebrow="Rangering" title="Toppliste" sub="Demo-data fra serveren, egen rangering for dag, uke og måned." />
      {!isFlagOn(s, 'LEADERBOARDS') ? <FeatureOff name="Topplister" /> : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-1 rounded-full bg-white/5 p-1">
            {periods.map((x) => <button key={x.k} onClick={() => setP(x)} data-testid={`tab-period-${x.k}`} className={`rounded-full py-2.5 text-sm font-semibold transition ${p.k === x.k ? 'btn-electric' : 'text-muted-foreground'}`}>{x.l}</button>)}
          </div>
          {rows.length === 0 ? <Empty title="Ingen på listen ennå" text="Tjen poeng for å dukke opp her." /> : (<>
            <div className="mb-6 grid grid-cols-3 items-end gap-3">
              {order.map((r) => (
                <Card key={r.rank} className={`text-center ${r.rank === 1 ? 'glass-glow pb-8 pt-6' : 'py-4'} ${r.isCurrentUser ? 'ring-1 ring-primary' : ''}`}>
                  {r.rank === 1 ? <Crown className="mx-auto mb-1 h-6 w-6 text-amber-300" /> : null}
                  <div className={`font-display mx-auto grid h-12 w-12 place-items-center rounded-2xl ${r.rank === 1 ? 'btn-gold' : 'bg-white/10'}`}>{r.rank}</div>
                  <div className="mt-2 truncate text-sm font-semibold">{r.name}</div><div className="text-xs tabular-nums text-amber-200">{fmt(r.points)}</div>
                </Card>))}
            </div>
            <Card className="p-2">
              {rows.slice(3).map((r) => (
                <div key={r.rank} data-testid={`row-rank-${r.rank}`} className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${r.isCurrentUser ? 'bg-primary/20 ring-1 ring-primary/40' : ''}`}>
                  <span className="w-8 text-center font-display text-sm text-muted-foreground">{r.rank}</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-bold">{r.name.slice(0, 2).toUpperCase()}</span>
                  <span className="flex-1 truncate font-medium">{r.name}{r.isCurrentUser && <span className="ml-2 text-xs text-primary">Deg</span>}</span>
                  <span className="text-sm font-semibold tabular-nums">{fmt(r.points)}</span>
                </div>))}
            </Card></>)}
        </>
      )}
    </>
  );
}
