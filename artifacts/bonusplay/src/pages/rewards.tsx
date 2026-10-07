import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Coins, Gift, ShoppingBag, Ticket } from 'lucide-react';
import { useCreateRedemption, type Reward } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Btn, Card, Empty, FeatureOff, PageHead, Pts } from '@/components/bp';
import { useReward } from '@/components/reward-modal';
import { useTrack } from '@/hooks/use-track';
import { applyResult, errMsg, isFlagOn, useBpState } from '@/hooks/use-bp';
import { useToast } from '@/hooks/use-toast';
import { fmt, fmtDate, fmtNok } from '@/lib/format';

export default function RewardsPage() {
  const s = useBpState();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { show } = useReward();
  const order = useCreateRedemption();
  const track = useTrack();
  const [sel, setSel] = useState<{ r: Reward; key: string } | null>(null);
  const [lack, setLack] = useState<Reward | null>(null);
  const on = isFlagOn(s, 'REDEMPTIONS');
  const pts = s.user.points;

  const pick = (r: Reward) => {
    track('reward_viewed', r.id);
    if (pts < r.cost) return setLack(r);
    track('redemption_started', r.id);
    setSel({ r, key: crypto.randomUUID() });
  };
  const confirm = () => {
    if (!sel || order.isPending) return;
    order.mutate({ data: { rewardId: sel.r.id, idempotencyKey: sel.key } }, {
      onSuccess: (res) => { applyResult(qc, res); setSel(null); show(res); },
      onError: (e) => toast({ title: 'Bestillingen feilet', description: errMsg(e), variant: 'destructive' }),
    });
  };
  const cats = Array.from(new Set(s.rewards.map((r) => r.category)));

  return (
    <>
      <PageHead eyebrow="Premiebutikk" title="Premier" sub="Bytt poeng mot demopremier. Ingen ekte utbetalinger finner sted." action={<Pts value={pts} />} />
      {!on && <div className="mb-4"><FeatureOff name="Innløsning" /></div>}
      {s.rewards.length === 0 ? <Empty icon={<ShoppingBag />} title="Ingen premier akkurat nå" /> : cats.map((c) => (
        <section key={c} className="mb-7">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">{c}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.rewards.filter((r) => r.category === c).map((r) => {
              const short = pts < r.cost;
              return (
                <Card key={r.id} className="flex flex-col" data-testid={`card-reward-${r.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="btn-gold grid h-12 w-12 shrink-0 place-items-center rounded-2xl"><Ticket /></div>
                    <div className="min-w-0 flex-1"><div className="font-semibold">{r.title}</div><div className="text-xs text-muted-foreground">{r.subtitle}</div></div>
                    <div className="text-right"><div className="font-display text-lg">{fmtNok(r.nokAmount)}</div><div className="text-[10px] uppercase text-muted-foreground">demo</div></div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 font-display gold-text text-lg"><Coins className="h-4 w-4 text-amber-300" />{fmt(r.cost)}</span>
                    <Btn size="sm" variant={short ? 'ghost' : 'gold'} disabled={!on || !r.available} onClick={() => pick(r)} data-testid={`button-redeem-${r.id}`}>
                      {!r.available ? 'Utsolgt' : short ? 'Ikke nok poeng' : 'Bestill'}</Btn>
                  </div>
                  {short && <p className="mt-2 text-xs text-muted-foreground">Mangler {fmt(r.cost - pts)} poeng</p>}
                </Card>);
            })}
          </div>
        </section>))}

      <h2 className="font-display mb-3 text-xl">Dine bestillinger</h2>
      {s.redemptions.length === 0 ? <Empty icon={<Gift />} title="Ingen bestillinger ennå" text="Bestill en demopremie så dukker den opp her." /> : (
        <div className="space-y-2">{s.redemptions.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 p-4" data-testid={`row-redemption-${r.id}`}>
            <div><div className="font-semibold">{r.rewardTitle}</div><div className="text-xs text-muted-foreground">{fmtDate(r.createdAt)} · {fmtNok(r.nokAmount)}</div></div>
            <div className="text-right"><Pts value={-r.points} /><div className="mt-1 text-[11px] text-amber-200">{r.status === 'PENDING' ? 'Venter (demo)' : 'Manuell vurdering (demo)'}</div></div>
          </Card>))}</div>)}

      <Dialog open={!!sel} onOpenChange={(o) => !o && !order.isPending && setSel(null)}>
        <DialogContent className="glass max-w-sm rounded-[2rem] border-white/10" data-testid="dialog-confirm-order">
          <DialogTitle className="font-display text-xl">Bekreft bestilling</DialogTitle>
          <DialogDescription>Du bestiller <b className="text-foreground">{sel?.r.title}</b> for {sel && fmt(sel.r.cost)} poeng. Dette er en demo uten ekte utbetaling.</DialogDescription>
          {sel && <div className="rounded-2xl bg-white/5 p-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Saldo nå</span><span className="tabular-nums">{fmt(pts)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Etter bestilling</span><span className="tabular-nums gold-text font-bold">{fmt(pts - sel.r.cost)}</span></div></div>}
          <div className="flex gap-2"><Btn variant="ghost" className="flex-1" disabled={order.isPending} onClick={() => setSel(null)} data-testid="button-cancel-order">Avbryt</Btn>
            <Btn variant="gold" className="flex-1" loading={order.isPending} onClick={confirm} data-testid="button-confirm-order">Bekreft</Btn></div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!lack} onOpenChange={(o) => !o && setLack(null)}>
        <DialogContent className="glass max-w-sm rounded-[2rem] border-white/10" data-testid="dialog-insufficient">
          <DialogTitle className="font-display text-xl">Ikke nok poeng</DialogTitle>
          <DialogDescription>Du trenger {lack && fmt(lack.cost - pts)} poeng til for å bestille {lack?.title}. Fullfør oppdrag og spill for å tjene mer.</DialogDescription>
          <Btn onClick={() => setLack(null)} data-testid="button-close-insufficient">Greit</Btn>
        </DialogContent>
      </Dialog>
    </>
  );
}
