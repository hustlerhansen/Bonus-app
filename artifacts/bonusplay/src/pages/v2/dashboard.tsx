import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, Flame, Gift, Lock, Sparkles, Target, Users } from 'lucide-react';
import {
  getGetV2EngagementQueryKey, getGetV2WalletQueryKey, getListV2OffersQueryKey, getListV2RewardsQueryKey, getListV2TransactionsQueryKey,
  useCheckInV2Engagement, useGetV2Engagement, useGetV2Wallet, useListV2Offers, useListV2Rewards, useListV2Transactions,
  type V2Account,
} from '@workspace/api-client-react';
import { AnimatedNumber, Btn, Card, Meter, Skel } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { cn } from '@/lib/utils';
import { fmtDate, useIsAdmin } from './shared';

const nf = new Intl.NumberFormat('nb-NO');
const kr = (bp: number) => `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(bp / 100)} kr`;
const TYPE: Record<string, string> = { EARN: 'Opptjent', REDEEM: 'Innløst', REFERRAL: 'Verving', BONUS: 'Bonus', ADJUSTMENT: 'Justering', REFUND: 'Refusjon', REVERSAL: 'Tilbakeført', EXPIRATION: 'Utløpt' };

function Balance() {
  const w = useGetV2Wallet({ query: { queryKey: getGetV2WalletQueryKey() } });
  if (w.isLoading) return <Skel className="h-40" />;
  if (w.isError || !w.data) return <Card><p className="text-sm text-red-300">{errMsg(w.error)}</p></Card>;
  const d = w.data;
  return (
    <Card glow className="relative overflow-hidden" data-testid="card-balance">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Tilgjengelig saldo</div>
      <div className="mt-1 flex items-baseline gap-2"><span className="gold-text font-display text-4xl tabular-nums"><AnimatedNumber value={d.available} /></span><span className="text-sm text-muted-foreground">BonusPoints</span></div>
      <div className="text-sm text-muted-foreground">= {kr(d.available)} i gavekortverdi</div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-white/5 p-2"><div className="font-bold tabular-nums">{nf.format(d.pending)}</div><div className="text-muted-foreground">venter</div></div>
        <div className="rounded-xl bg-white/5 p-2"><div className="font-bold tabular-nums">{nf.format(d.lifetimeEarned)}</div><div className="text-muted-foreground">opptjent totalt</div></div>
        <div className="rounded-xl bg-white/5 p-2"><div className="font-bold tabular-nums">{nf.format(d.lifetimeRedeemed)}</div><div className="text-muted-foreground">innløst</div></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/account/offers"><Btn variant="gold" shine icon={<Target className="h-4 w-4" />} data-testid="button-earn">Tjen poeng</Btn></Link>
        <Link href="/account/rewards"><Btn variant="ghost" icon={<Gift className="h-4 w-4" />}>Løs inn</Btn></Link>
      </div>
    </Card>
  );
}

function Progress() {
  const qc = useQueryClient();
  const e = useGetV2Engagement({ query: { queryKey: getGetV2EngagementQueryKey() } });
  const check = useCheckInV2Engagement();
  if (e.isLoading) return <Skel className="h-40" />;
  if (e.isError || !e.data) return null;
  const d = e.data;
  const span = d.nextLevelXp - d.levelFloorXp, into = d.xp - d.levelFloorXp;
  return (
    <Card data-testid="card-progress">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs uppercase tracking-widest text-muted-foreground">Nivå {d.level}</div><div className="font-display text-2xl">{d.levelName}</div></div>
        <div className="flex items-center gap-1.5 rounded-full bg-orange-400/15 px-3 py-1 text-sm font-bold text-orange-200" data-testid="text-streak"><Flame className="h-4 w-4" />{d.streak} {d.streak === 1 ? 'dag' : 'dager'}</div>
      </div>
      <div className="mt-3"><Meter value={into} max={span} /></div>
      <div className="mt-1 text-xs text-muted-foreground">{nf.format(d.nextLevelXp - d.xp)} XP til nivå {d.level + 1}</div>
      <div className="mt-3">
        {d.checkedInToday ? <p className="flex items-center gap-1.5 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Du har sjekket inn i dag. Kom tilbake i morgen for å holde streaken.</p>
          : <Btn size="sm" variant="electric" icon={<Sparkles className="h-4 w-4" />} loading={check.isPending}
            onClick={() => check.mutate(undefined, { onSuccess: r => qc.setQueryData(getGetV2EngagementQueryKey(), r) })} data-testid="button-checkin">Sjekk inn (+XP)</Btn>}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">XP, nivåer og merker er for motivasjon og kan ikke løses inn. BonusPoints tjenes på verifiserte tilbud.</p>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Merker">
        {d.badges.map(b => <span key={b.id} title={b.description} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', b.earned ? 'bg-amber-400/15 text-amber-200' : 'bg-white/5 text-muted-foreground opacity-60')}>{b.earned ? <Award className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{b.title}</span>)}
      </div>
    </Card>
  );
}

function Recommended() {
  const q = useListV2Offers({ query: { queryKey: getListV2OffersQueryKey() } });
  if (q.isLoading) return <Skel className="h-32" />;
  const items = (q.data?.items ?? []).filter(o => o.status === 'approved').sort((a, b) => b.points - a.points).slice(0, 3);
  return (
    <section aria-labelledby="h-rec">
      <div className="mb-2 flex items-center justify-between"><h2 id="h-rec" className="font-display text-lg">Anbefalt for deg</h2><Link href="/account/offers" className="text-sm text-primary">Se alle</Link></div>
      {!q.data?.earnEnabled || items.length === 0 ? <Card className="text-sm text-muted-foreground">Tilbudene åpnes gradvis. Du får beskjed her når de første partnerne er på plass.</Card> : (
        <ul className="grid gap-2">{items.map(o => (
          <li key={o.id}><Link href={`/account/offers/${o.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-3 hover:bg-white/10">
            <div className="min-w-0"><div className="text-xs text-muted-foreground">{o.partnerName}</div><div className="truncate font-bold">{o.title}</div><div className="text-[11px] text-muted-foreground">ca. {o.estimatedMinutes} min · godkjennes innen {o.approvalDays} dager</div></div>
            <div className="shrink-0 text-right"><div className="gold-text font-display text-lg tabular-nums">+{nf.format(o.points)}</div><div className="text-[11px] text-muted-foreground">BP</div></div>
          </Link></li>))}</ul>)}
    </section>
  );
}

function Goal() {
  const r = useListV2Rewards({ query: { queryKey: getListV2RewardsQueryKey() } });
  const w = useGetV2Wallet({ query: { queryKey: getGetV2WalletQueryKey() } });
  const next = (r.data?.items ?? []).filter(x => x.status === 'approved').sort((a, b) => a.points - b.points)[0];
  if (!next || !w.data) return null;
  const left = Math.max(0, next.points - w.data.available);
  return (
    <Card data-testid="card-goal">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Neste mål</div>
      <div className="font-bold">{next.title}</div>
      <div className="mt-2"><Meter value={Math.min(w.data.available, next.points)} max={next.points} tone="gold" /></div>
      <div className="mt-1 text-xs text-muted-foreground">{left === 0 ? 'Du har nok poeng!' : `${nf.format(left)} BP igjen`}</div>
    </Card>
  );
}

function Recent() {
  const params = { limit: 5 };
  const q = useListV2Transactions(params, { query: { queryKey: getListV2TransactionsQueryKey(params) } });
  if (q.isLoading) return <Skel className="h-32" />;
  const items = q.data?.items ?? [];
  return (
    <section aria-labelledby="h-recent">
      <div className="mb-2 flex items-center justify-between"><h2 id="h-recent" className="font-display text-lg">Siste aktivitet</h2><Link href="/account/points" className="text-sm text-primary">Historikk</Link></div>
      {items.length === 0 ? <Card className="text-sm text-muted-foreground">Ingen aktivitet ennå. Fullfør et tilbud for å tjene dine første BonusPoints.</Card> : (
        <ul className="divide-y divide-white/5 rounded-2xl bg-white/5">{items.map(t => (
          <li key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0"><div className="truncate font-bold">{t.description}</div><div className="text-[11px] text-muted-foreground">{TYPE[t.type] ?? t.type} · {fmtDate(t.createdAt)}{t.status === 'pending' ? ' · venter' : ''}</div></div>
            <div className={cn('shrink-0 font-bold tabular-nums', t.amount > 0 ? 'text-emerald-300' : 'text-muted-foreground')}>{t.amount > 0 ? '+' : ''}{nf.format(t.amount)}</div>
          </li>))}</ul>)}
    </section>
  );
}

export function UserDashboard({ a }: { a: V2Account }) {
  const isAdmin = useIsAdmin();
  return (
    <div className="space-y-5">
      <header>
        <div className="text-xs uppercase tracking-widest text-primary">Velkommen tilbake</div>
        <h1 className="font-display text-3xl">Hei, {a.firstName}</h1>
      </header>
      <div className="grid gap-4 md:grid-cols-2"><Balance /><Progress /></div>
      <Goal />
      <Recommended />
      <Recent />
      <Card className="flex items-center gap-3 text-sm"><Users className="h-6 w-6 shrink-0 text-primary" /><div><b>Inviter venner</b><div className="text-muted-foreground">Vervebonus åpnes senere. Den gis først når vennen din har fullført et verifisert tilbud.</div></div></Card>
      {isAdmin && <Link href="/account/admin"><Btn variant="ghost" className="w-full">Til administrasjon</Btn></Link>}
    </div>
  );
}
