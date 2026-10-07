import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Coins, Gem, Receipt } from 'lucide-react';
import { AnimatedNumber, Card, Empty, PageHead } from '@/components/bp';
import { useBpState } from '@/hooks/use-bp';
import { fmt, fmtDate, fmtPointsValue, isThisWeek, isToday } from '@/lib/format';

const cur = [['all', 'Alle valutaer'], ['points', 'Poeng'], ['gems', 'Juveler']] as const;
const per = [['all', 'ALLE'], ['today', 'I DAG'], ['week', 'DENNE UKEN']] as const;
const dir = [['all', 'Alle'], ['in', 'Inn'], ['out', 'Ut']] as const;

export default function WalletPage() {
  const s = useBpState();
  const [c, setC] = useState<string>('all');
  const [d, setD] = useState<string>('all');
  const [pr, setPr] = useState<string>('all');
  const rows = s.transactions.filter((t) => (pr === 'all' || (pr === 'today' ? isToday(t.createdAt) : isThisWeek(t.createdAt))) && (c === 'all' || t.currency === c) && (d === 'all' || (d === 'in' ? t.amount > 0 : t.amount < 0)));
  const Chip = ({ on, onClick, children, id }: { on: boolean; onClick: () => void; children: string; id: string }) => (
    <button onClick={onClick} data-testid={id} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${on ? 'btn-electric border-transparent' : 'border-white/15 bg-white/5 text-muted-foreground'}`}>{children}</button>);
  return (
    <>
      <PageHead eyebrow="Lommebok" title="Transaksjoner" sub="Hele historikken din, hentet fra serveren." />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Card glow><Coins className="h-5 w-5 text-amber-300" /><div className="mt-3 text-xs text-muted-foreground">Poeng</div><AnimatedNumber value={s.user.points} className="font-display gold-text text-3xl" /><div className="mt-1 text-[11px] text-muted-foreground" data-testid="text-points-value">{fmtPointsValue(s.user.points)}</div></Card>
        <Card><Gem className="h-5 w-5 text-fuchsia-300" /><div className="mt-3 text-xs text-muted-foreground">Juveler</div><AnimatedNumber value={s.user.gems} className="font-display text-3xl text-fuchsia-200" /></Card>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Omtrentlig demoverdi: 100 poeng tilsvarer 1 kr. Kun demo, ingen ekte penger.</p>
      <div className="mb-2 flex flex-wrap gap-2">{per.map(([k, l]) => <Chip key={k} id={`filter-period-${k}`} on={pr === k} onClick={() => setPr(k)}>{l}</Chip>)}</div>
      <div className="mb-2 flex flex-wrap gap-2">{cur.map(([k, l]) => <Chip key={k} id={`filter-currency-${k}`} on={c === k} onClick={() => setC(k)}>{l}</Chip>)}</div>
      <div className="mb-5 flex flex-wrap gap-2">{dir.map(([k, l]) => <Chip key={k} id={`filter-dir-${k}`} on={d === k} onClick={() => setD(k)}>{l}</Chip>)}</div>
      {rows.length === 0 ? <Empty icon={<Receipt />} title="Ingen transaksjoner" text="Ingenting matcher filteret ditt. Prøv et annet." /> : (
        <Card className="p-2">{rows.map((t) => (
          <div key={t.id} data-testid={`row-tx-${t.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/5">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${t.amount > 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>{t.amount > 0 ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{t.title}</div><div className="text-xs text-muted-foreground">{fmtDate(t.createdAt)}</div></div>
            <div className={`text-right text-sm font-bold tabular-nums ${t.amount > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{t.amount > 0 ? '+' : ''}{fmt(t.amount)}<div className="text-[10px] font-medium uppercase text-muted-foreground">{t.currency === 'points' ? 'poeng' : 'juveler'}</div></div>
          </div>))}</Card>)}
    </>
  );
}
