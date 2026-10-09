import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldAlert } from 'lucide-react';
import {
  getGetV2RewardQueryKey, getGetV2WalletQueryKey, getListV2AdminOrdersQueryKey, getListV2AdminRewardsQueryKey, getListV2OrdersQueryKey,
  getListV2RewardsQueryKey, getReconcileV2RewardsQueryKey, getListV2RewardSuppliersQueryKey,
  useActionV2Order, useCreateV2Reward, useGetV2Reward, useGetV2Wallet, useListV2AdminOrders, useListV2AdminRewards, useListV2Orders,
  useListV2RewardSuppliers, useListV2Rewards, useReconcileV2Rewards, useRedeemV2Reward, useReviewV2Reward,
  type V2Reward, type V2RewardOrder,
} from '@workspace/api-client-react';
import { Btn, Card, Empty, ErrorState, PageHead, Skel } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { cn } from '@/lib/utils';
import { apiErrorCode, fmtDate, queuedText, ScrollTop, SignedInOnly, useApprovalRequest, useV2State, V2Frame } from './shared';

const nf = new Intl.NumberFormat('nb-NO');
const inputCls = 'mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40 sm:text-sm';
const ORDER: Record<string, string> = { reserved: 'Reservert', delivering: 'Under levering', uncertain: 'Usikker status', delivered: 'Levert', refunded: 'Refundert' };
const RSTAT: Record<string, string> = { draft: 'Utkast', approved: 'Godkjent', disabled: 'Deaktivert' };
const tone: Record<string, string> = { reserved: 'bg-sky-400/10 text-sky-200', delivering: 'bg-amber-400/10 text-amber-200', uncertain: 'bg-red-400/10 text-red-300', delivered: 'bg-emerald-400/10 text-emerald-300', refunded: 'bg-white/10 text-muted-foreground', draft: 'bg-sky-400/10 text-sky-200', approved: 'bg-emerald-400/10 text-emerald-300', disabled: 'bg-red-400/10 text-red-300' };
const POLL = 30000;
function useFinitePoll() {
  return POLL;
}

function useGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const s = useV2State();
  const acc = s.data?.account ?? null;
  const active = isLoaded && !!isSignedIn && !!acc && acc.status === 'ACTIVE';
  return { s, acc, active, isAdmin: active && (acc?.role === 'ADMIN' || acc?.role === 'SUPER_ADMIN') };
}
function Gate({ children }: { children: (g: ReturnType<typeof useGate>) => ReactNode }) {
  const g = useGate();
  if (g.s.isLoading) return <Skel className="h-40" />;
  if (g.s.isError) return <ErrorState message={errMsg(g.s.error)} onRetry={() => g.s.refetch()} />;
  if (!g.active) return <Empty icon={<Lock />} title="Konto må være aktiv" text="Premier krever en registrert og aktiv BONUSPLAY-konto." action={<Link href="/account"><Btn variant="ghost">Til kontooversikt</Btn></Link>} />;
  return <>{children(g)}</>;
}
function Chip({ k, children }: { k: string; children: ReactNode }) {
  return <span className={cn('inline-block rounded-full px-2.5 py-1 text-[11px] font-bold', tone[k])}>{children}</span>;
}
function L({ id, t, children }: { id: string; t: string; children: ReactNode }) {
  return <div><label htmlFor={id} className="text-sm font-bold">{t}</label>{children}</div>;
}
function GateOff() {
  return (
    <div className="mb-5 flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100" role="status" data-testid="notice-redeem-off">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p><b>Innløsning er ikke åpnet.</b> Premier kan ses, men ikke bestilles før driften har åpnet innløsning. Ingen poeng trekkes før da.</p>
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return (rewardId?: string) => Promise.all([
    qc.invalidateQueries({ queryKey: getGetV2WalletQueryKey() }),
    qc.invalidateQueries({ queryKey: getListV2OrdersQueryKey() }),
    qc.invalidateQueries({ queryKey: getListV2AdminOrdersQueryKey() }),
    qc.invalidateQueries({ queryKey: getListV2RewardsQueryKey() }),
    qc.invalidateQueries({ queryKey: getListV2AdminRewardsQueryKey() }),
    qc.invalidateQueries({ queryKey: getReconcileV2RewardsQueryKey() }),
    ...(rewardId ? [qc.invalidateQueries({ queryKey: getGetV2RewardQueryKey(rewardId) })] : []),
    qc.invalidateQueries({ predicate: q => { const k = q.queryKey[0]; return typeof k === 'string' && /^\/api\/v2\/(admin\/)?(transactions|accounts)/.test(k); } }),
  ]);
}

function RewardCard({ r, i }: { r: V2Reward; i: number }) {
  return (
    <Link href={`/account/rewards/${r.id}`} className="group block rise" style={{ animationDelay: `${i * 50}ms` }} data-testid={`card-reward-${r.id}`}>
      <Card className="transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[.98]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{r.supplierName}</div>
            <h3 className="font-display text-base font-bold">{r.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{r.stock > 0 ? `${nf.format(r.stock)} på lager` : 'Utsolgt'}</p>
          </div>
          <div className="shrink-0 text-right"><div className="gold-text font-display text-xl font-bold tabular-nums">{nf.format(r.points)}</div><div className="text-[11px] text-muted-foreground">poeng</div></div>
        </div>
      </Card>
    </Link>
  );
}

function BalanceBar() {
  const w = useGetV2Wallet({ query: { queryKey: getGetV2WalletQueryKey() } });
  return <div className="mb-5 rounded-2xl bg-white/5 p-4 text-sm" data-testid="text-wallet-available">{w.isLoading ? <Skel className="h-6" /> : w.isError ? 'Kunne ikke hente saldo.' : <>Tilgjengelig: <b className="tabular-nums">{nf.format(w.data!.available)}</b> poeng · reservert {nf.format(w.data!.reserved)}</>}</div>;
}

export function RewardsPage() {
  return <SignedInOnly><V2Frame nav title="Premier" desc="Operatørgodkjente premier du kan bytte poeng mot."><ScrollTop /><PageHead eyebrow="Konto" title="Premier" sub="Bytt sporbare poeng mot operatørgodkjente premier." /><Gate>{g => <RewardsInner admin={g.isAdmin} />}</Gate></V2Frame></SignedInOnly>;
}
function RewardsInner({ admin }: { admin: boolean }) {
  const q = useListV2Rewards({ query: { queryKey: getListV2RewardsQueryKey() } });
  const items = q.data?.items.filter(r => r.status === 'approved') ?? [];
  return (
    <div className="space-y-5">
      <BalanceBar />
      {q.data && !q.data.redeemEnabled && <GateOff />}
      <div className="flex gap-4 text-sm font-bold text-primary">
        <Link href="/account/orders" className="underline" data-testid="link-orders">Mine bestillinger</Link>
        {admin && <Link href="/account/rewards/admin" className="underline" data-testid="link-rewards-admin">Premieadministrasjon</Link>}
      </div>
      {q.isLoading ? <div className="space-y-3"><Skel className="h-28" /><Skel className="h-28" /></div>
        : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : items.length === 0 ? <Empty title="Ingen premier ennå" text="Premier vises her når en operatør har godkjent dem." />
        : <div className="space-y-3">{items.map((r, i) => <RewardCard key={r.id} r={r} i={i} />)}</div>}
    </div>
  );
}

function OrderRow({ o }: { o: V2RewardOrder }) {
  return (
    <li className="rounded-2xl bg-white/5 p-3" data-testid={`row-order-${o.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-bold">{o.title}</div><div className="text-xs text-muted-foreground">{fmtDate(o.createdAt)} · {nf.format(o.points)} poeng</div></div>
        <Chip k={o.status}>{ORDER[o.status]}</Chip>
      </div>
      <div className="mt-1 break-all text-[11px] text-muted-foreground">Transaksjon {o.transactionId} · oppdatert {fmtDate(o.updatedAt)}</div>
      {o.status === 'uncertain' && <p className="mt-1 text-xs text-amber-200">Leveringsstatus er uavklart. Operatøren avklarer og leverer eller refunderer poengene.</p>}
    </li>
  );
}

export function OrdersPage() {
  return <SignedInOnly><V2Frame nav title="Bestillinger" desc="Din ordrehistorikk."><ScrollTop /><PageHead eyebrow="Konto" title="Mine bestillinger" sub="Status oppdateres av operatør, ikke automatisk fra leverandør." /><Gate>{() => <OrdersInner />}</Gate></V2Frame></SignedInOnly>;
}
function OrdersInner() {
  const poll = useFinitePoll();
  const q = useListV2Orders({ query: { queryKey: getListV2OrdersQueryKey(), refetchInterval: poll } });
  return (
    <div className="space-y-4">
      <Link href="/account/rewards" className="text-sm text-muted-foreground underline" data-testid="link-back-rewards">Til premier</Link>
      <p className="text-xs text-muted-foreground">Oppdateres hvert 30. sekund mens siden er åpen.</p>
      {q.isLoading ? <Skel className="h-24" /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : q.data!.items.length === 0 ? <Empty title="Ingen bestillinger" text="Når du har løst inn en premie, vises den her." />
        : <ul className="space-y-2">{q.data!.items.map(o => <OrderRow key={o.id} o={o} />)}</ul>}
    </div>
  );
}

export function RewardDetailPage() {
  return <SignedInOnly><V2Frame nav title="Premie" desc="Detaljer og innløsning."><ScrollTop /><Gate>{g => <DetailInner accountId={g.acc!.id} />}</Gate></V2Frame></SignedInOnly>;
}
function DetailInner({ accountId }: { accountId: string }) {
  const { rewardId = '' } = useParams<{ rewardId: string }>();
  const [, nav] = useLocation();
  const q = useGetV2Reward(rewardId, { query: { enabled: !!rewardId, queryKey: getGetV2RewardQueryKey(rewardId) } });
  const w = useGetV2Wallet({ query: { queryKey: getGetV2WalletQueryKey() } });
  const redeem = useRedeemV2Reward();
  const refresh = useRefresh();
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<V2RewardOrder | null>(null);
  const sk = `bp.v2.redeem.${accountId}.${rewardId}`;
  const [retryKey, setRetryKey] = useState<string | null>(() => sessionStorage.getItem(sk));
  const getKey = () => {
    let k = sessionStorage.getItem(sk);
    if (!k) { k = crypto.randomUUID(); sessionStorage.setItem(sk, k); }
    return k;
  };
  useEffect(() => { setAck(false); setDone(null); setRetryKey(sessionStorage.getItem(sk)); }, [sk]);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => nav('/account/orders'), 3500);
    return () => clearTimeout(timer);
  }, [done, nav]);
  const run = () => {
    const key = retryKey ?? getKey();
    setRetryKey(key);
    redeem.mutate({ rewardId, data: { idempotencyKey: key } }, {
      onSuccess: o => { sessionStorage.removeItem(sk); setRetryKey(null); setDone(o); void refresh(rewardId); },
    });
  };
  const recovery = retryKey && !done ? <Card>
    <p className="mb-3 text-sm">Et tidligere forsøk mangler bekreftet svar. Hent resultatet med samme nøkkel før du prøver en ny innløsning.</p>
    <Btn onClick={run} loading={redeem.isPending} disabled={redeem.isPending} data-testid="button-redeem-recover">Hent resultat av tidligere forsøk</Btn>
    {redeem.isError && <p role="alert" className="mt-2 text-sm text-red-300">{errMsg(redeem.error)}</p>}
    <Link href="/account/orders" className="ml-3 text-sm underline">Mine bestillinger</Link>
  </Card> : null;
  if (q.isLoading) return <div className="space-y-3"><Skel className="h-10" /><Skel className="h-48" /></div>;
  if (q.isError || !q.data) return <>{recovery}<ErrorState message={q.error ? errMsg(q.error) : 'Fant ikke premien.'} onRetry={() => q.refetch()} /></>;
  const { reward, redeemEnabled } = q.data;
  const avail = w.data?.available;
  const enough = avail !== undefined && avail >= reward.points;
  const reason = !redeemEnabled ? 'Innløsning er ikke åpnet.' : reward.status !== 'approved' ? 'Premien er ikke godkjent.' : reward.stock <= 0 ? 'Premien er utsolgt.' : w.isLoading ? 'Henter saldo.' : !enough ? 'Du har ikke nok tilgjengelige poeng.' : null;
  return (
    <div className="space-y-5">
      <Link href="/account/rewards" className="text-sm text-muted-foreground underline" data-testid="link-back-rewards">Tilbake til premier</Link>
      <PageHead eyebrow={reward.supplierName} title={reward.title} sub={`${nf.format(reward.points)} poeng · ${reward.stock > 0 ? `${nf.format(reward.stock)} på lager` : 'utsolgt'}`} />
      {!redeemEnabled && <GateOff />}
      {recovery}
      <Card><h2 className="mb-1 font-bold">Beskrivelse</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground">{reward.description}</p></Card>
      <Card><h2 className="mb-1 font-bold">Vilkår</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground" data-testid="text-reward-terms">{reward.terms}</p></Card>
      <Card glow>
        <h2 className="mb-2 font-bold">Bekreft innløsning</h2>
        {done ? (
          <div className="animate-pop rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm" data-testid="panel-order-done" role="status">
            <p className="font-bold text-emerald-200">Bestilling registrert: {done.title}</p>
             <p className="mt-1">{nf.format(done.points)} poeng. Gjeldende status: {ORDER[done.status]}. Levering bekreftes av operatør. Du sendes til bestillingene dine.</p>
            <Link href="/account/orders" className="mt-2 inline-block font-bold underline">Gå til bestillinger nå</Link>
          </div>
        ) : <>
          <dl className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-3 text-sm">
            <dt className="text-muted-foreground">Pris</dt><dd className="text-right font-bold tabular-nums">{nf.format(reward.points)} poeng</dd>
            <dt className="text-muted-foreground">Din saldo</dt><dd className="text-right tabular-nums">{avail === undefined ? '-' : nf.format(avail)}</dd>
            <dt className="text-muted-foreground">Etter innløsning</dt><dd className="text-right tabular-nums">{avail === undefined ? '-' : nf.format(avail - reward.points)}</dd>
          </dl>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[hsl(217_100%_60%)]" checked={ack} onChange={e => setAck(e.target.checked)} disabled={!!reason} data-testid="check-redeem-ack" />
            <span>Jeg bekrefter prisen ({nf.format(reward.points)} poeng) og vilkårene over. Poengene reserveres med en gang, og levering skjer manuelt via operatør.</span>
          </label>
          <div className="mt-4"><Btn variant="gold" shine loading={redeem.isPending} disabled={!!reason || !ack || redeem.isPending || !!retryKey} onClick={run} data-testid="button-redeem">Løs inn</Btn></div>
          {reason && <p className="mt-2 text-xs text-muted-foreground" data-testid="text-redeem-disabled">{reason}</p>}
          <div aria-live="polite">{redeem.isError && <p className="mt-3 text-sm text-red-300" role="alert" data-testid="text-redeem-error">{errMsg(redeem.error)} Nytt forsøk bruker samme nøkkel, så du belastes ikke dobbelt.</p>}</div>
        </>}
      </Card>
    </div>
  );
}

const ACTIONS: { action: 'dispatch' | 'delivered' | 'uncertain' | 'refund'; label: string; from: string[] }[] = [
  { action: 'dispatch', label: 'Marker sendt til levering', from: ['reserved'] },
  { action: 'delivered', label: 'Bekreft levert', from: ['delivering', 'uncertain'] },
  { action: 'uncertain', label: 'Marker usikker', from: ['delivering'] },
  { action: 'refund', label: 'Refunder poeng', from: ['reserved', 'delivering', 'uncertain'] },
];

export function RewardsAdminPage() {
  return <SignedInOnly><V2Frame nav title="Premieadmin" desc="Utkast, godkjenning, leveringskø og avstemming."><ScrollTop /><PageHead eyebrow="Admin" title="Premieadministrasjon" sub="Ingen automatisk leverandørlevering. Alle trinn er manuelle og sporbare." /><Gate>{g => g.isAdmin ? <AdminInner /> : <Empty icon={<Lock />} title="Kun for administratorer" text="Du trenger rollen ADMIN eller SUPER_ADMIN." />}</Gate></V2Frame></SignedInOnly>;
}
function AdminInner() {
  const [tab, setTab] = useState<'rewards' | 'orders' | 'recon' | 'create'>('orders');
  const tabs: [typeof tab, string][] = [['orders', 'Leveringskø'], ['rewards', 'Premier'], ['create', 'Nytt utkast'], ['recon', 'Avstemming']];
  return (
    <div>
      <div role="tablist" aria-label="Admin" className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-white/5 p-1 text-sm">
        {tabs.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} className={cn('flex-1 whitespace-nowrap rounded-full px-3 py-2 font-bold transition', tab === k ? 'btn-electric' : 'text-muted-foreground')} onClick={() => setTab(k)} data-testid={`tab-rewards-${k}`}>{l}</button>)}
      </div>
      {tab === 'create' && <CreateForm onDone={() => setTab('rewards')} />}
      {tab === 'rewards' && <AdminRewards />}
      {tab === 'orders' && <AdminOrders />}
      {tab === 'recon' && <Recon />}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const sup = useListV2RewardSuppliers({ query: { queryKey: getListV2RewardSuppliersQueryKey() } });
  const create = useCreateV2Reward();
  const refresh = useRefresh();
  const empty = { supplierId: '', title: '', description: '', terms: '', points: '', stock: '', supplierSku: '', approvalReference: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  if (sup.isLoading) return <Skel className="h-60" />;
  if (sup.isError) return <ErrorState message={errMsg(sup.error)} onRetry={() => sup.refetch()} />;
  if (!sup.data || sup.data.length === 0) return <Empty icon={<Lock />} title="Ingen leverandører er satt opp" text="Leverandører klargjøres av operatør. Det finnes ingen funksjon for å opprette dem her, så en premie kan ikke lages før da." />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const points = Number(f.points), stock = Number(f.stock);
    if (!f.supplierId) return setErr('Velg en leverandør.');
    if (f.title.trim().length < 3 || f.title.length > 120) return setErr('Tittel må være 3-120 tegn.');
    if (f.description.trim().length < 10 || f.description.length > 2000) return setErr('Beskrivelse må være 10-2000 tegn.');
    if (f.terms.trim().length < 10 || f.terms.length > 2000) return setErr('Vilkår må være 10-2000 tegn.');
    if (!Number.isInteger(points) || points < 1 || points > 1000000) return setErr('Poeng må være et heltall mellom 1 og 1 000 000.');
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return setErr('Lager må være et heltall mellom 0 og 1 000 000.');
    if (f.supplierSku.trim().length < 1 || f.supplierSku.length > 128) return setErr('Leverandørens SKU må være 1-128 tegn.');
    if (f.approvalReference.trim().length < 10 || f.approvalReference.length > 200) return setErr('Godkjenningsreferanse må være 10-200 tegn.');
    setErr(null);
    create.mutate({ data: { supplierId: f.supplierId, title: f.title.trim(), description: f.description.trim(), terms: f.terms.trim(), points, stock, supplierSku: f.supplierSku.trim(), approvalReference: f.approvalReference.trim() } }, {
      onSuccess: () => { void refresh(); setF(empty); onDone(); }, onError: x => setErr(errMsg(x)),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="rounded-xl bg-sky-400/10 p-3 text-sm text-sky-100">Utkastet er uforanderlig etter opprettelse. Pris og vilkår kan ikke endres, bare godkjennes eller deaktiveres.</p>
      <L id="rw-sup" t="Leverandør"><select id="rw-sup" className={inputCls} value={f.supplierId} onChange={set('supplierId')} data-testid="select-supplier"><option value="">Velg leverandør</option>{sup.data.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}</select></L>
      <L id="rw-title" t="Tittel"><input id="rw-title" className={inputCls} value={f.title} onChange={set('title')} maxLength={120} data-testid="input-reward-title" /></L>
      <L id="rw-desc" t="Beskrivelse"><textarea id="rw-desc" rows={3} className={inputCls} value={f.description} onChange={set('description')} maxLength={2000} /></L>
      <L id="rw-terms" t="Vilkår"><textarea id="rw-terms" rows={4} className={inputCls} value={f.terms} onChange={set('terms')} maxLength={2000} /></L>
      <L id="rw-points" t="Poeng"><input id="rw-points" inputMode="numeric" className={inputCls} value={f.points} onChange={set('points')} /></L>
      <L id="rw-stock" t="Lager"><input id="rw-stock" inputMode="numeric" className={inputCls} value={f.stock} onChange={set('stock')} /></L>
      <L id="rw-sku" t="Leverandørens SKU"><input id="rw-sku" className={inputCls} value={f.supplierSku} onChange={set('supplierSku')} maxLength={128} /></L>
      <L id="rw-ref" t="Godkjenningsreferanse"><input id="rw-ref" className={inputCls} value={f.approvalReference} onChange={set('approvalReference')} maxLength={200} /></L>
      <div aria-live="polite">{err && <p className="text-sm text-red-300" role="alert" data-testid="text-create-error">{err}</p>}</div>
      <Btn type="submit" loading={create.isPending} disabled={create.isPending} data-testid="button-create-reward">Opprett utkast</Btn>
    </form>
  );
}

function ReasonBox({ onSubmit, label, pending, danger, testid, children }: { onSubmit: (r: string, ev: string) => void; label: string; pending: boolean; danger?: boolean; testid: string; children?: ReactNode }) {
  const [r, setR] = useState('');
  const [ev, setEv] = useState('');
  const [ok2, setOk2] = useState(!children);
  const needEv = !!children || testid.startsWith('ord-');
  const ok = r.trim().length >= 10 && r.length <= 500 && (!needEv || (ev.trim().length >= 10 && ev.length <= 200)) && ok2;
  return (
    <form className="mt-2 space-y-2" onSubmit={(e: FormEvent) => { e.preventDefault(); if (ok) onSubmit(r.trim(), ev.trim()); }}>
      <label className="sr-only" htmlFor={testid}>Begrunnelse</label>
      <input id={testid} className={cn(inputCls, 'mt-0')} placeholder="Begrunnelse, minst 10 tegn" value={r} maxLength={500} onChange={e => setR(e.target.value)} data-testid={`input-${testid}`} />
      {needEv && <input className={cn(inputCls, 'mt-0')} aria-label="Bevisreferanse" placeholder="Bevisreferanse, minst 10 tegn" value={ev} maxLength={200} onChange={e => setEv(e.target.value)} data-testid={`input-ev-${testid}`} />}
      {children && <label className="flex items-start gap-2 text-xs text-red-200"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={ok2} onChange={e => setOk2(e.target.checked)} data-testid={`check-${testid}`} />{children}</label>}
      <Btn type="submit" size="sm" variant={danger ? 'danger' : 'electric'} loading={pending} disabled={!ok || pending} data-testid={`button-${testid}`}>{label}</Btn>
    </form>
  );
}

function AdminRewards() {
  const q = useListV2AdminRewards({ query: { queryKey: getListV2AdminRewardsQueryKey() } });
  const review = useReviewV2Reward();
  const approval = useApprovalRequest();
  const refresh = useRefresh();
  const [msg, setMsg] = useState<string | null>(null);
  const act = (r: V2Reward, status: 'approved' | 'disabled') => (reason: string) => {
    setMsg(null);
    if (status === 'approved') { approval.send('REWARD_APPROVAL', { rewardId: r.id }, reason, { onQueued: q => setMsg(queuedText(q)), onError: x => setMsg(errMsg(x)) }); return; }
    review.mutate({ rewardId: r.id, data: { status, reason } }, { onSuccess: () => { void refresh(r.id); setMsg('Premien er deaktivert.'); }, onError: x => setMsg(errMsg(x)) });
  };
  if (q.isLoading) return <Skel className="h-40" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div>
      <div aria-live="polite" className="mb-2 text-sm" data-testid="text-reward-review-msg">{msg}</div>
      <p className="mb-3 text-xs text-muted-foreground">Innløsningsbryteren: {q.data!.redeemEnabled ? 'åpen' : 'stengt'}. Styres av drift, ikke herfra.</p>
      {q.data!.items.length === 0 ? <Empty title="Ingen premier" text="Opprett et utkast under Nytt utkast." /> : (
        <ul className="space-y-3">{q.data!.items.map(r => (
          <li key={r.id} className="rounded-2xl bg-white/5 p-4" data-testid={`row-admin-reward-${r.id}`}>
            <div className="flex items-start justify-between gap-2"><div><div className="text-xs text-muted-foreground">{r.supplierName}</div><div className="font-bold">{r.title}</div><div className="text-xs">{nf.format(r.points)} poeng · lager {nf.format(r.stock)}</div></div><Chip k={r.status}>{RSTAT[r.status]}</Chip></div>
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Kontroller beskrivelse og vilkår</summary><div className="mt-2 space-y-2 whitespace-pre-wrap break-words"><p>{r.description}</p><p><b>Vilkår:</b> {r.terms}</p></div></details>
            {r.status === 'draft' && <ReasonBox testid={`approve-${r.id}`} label="Send til godkjenning" pending={review.isPending || approval.isPending} onSubmit={act(r, 'approved')} />}
            {r.status !== 'disabled' && <ReasonBox testid={`disable-${r.id}`} label="Deaktiver" danger pending={review.isPending} onSubmit={act(r, 'disabled')} />}
          </li>))}</ul>)}
    </div>
  );
}

function AdminOrders() {
  const actorId = useV2State().data?.account?.id ?? 'unknown';
  const poll = useFinitePoll();
  const q = useListV2AdminOrders({ query: { queryKey: getListV2AdminOrdersQueryKey(), refetchInterval: poll } });
  const rw = useListV2AdminRewards({ query: { queryKey: getListV2AdminRewardsQueryKey() } });
  const act = useActionV2Order();
  const approval = useApprovalRequest();
  const refresh = useRefresh();
  const [msg, setMsg] = useState<string | null>(null);
  const keys = useRef<Record<string, string>>({});
  const gate = rw.data?.redeemEnabled === true;
  const run = (o: V2RewardOrder, action: 'dispatch' | 'delivered' | 'uncertain' | 'refund') => (reason: string, evidenceReference: string) => {
    setMsg(null);
    const kk = `bp.v2.order.${actorId}.${o.id}.${action}`;
    const idempotencyKey = keys.current[kk] ?? (keys.current[kk] = sessionStorage.getItem(kk) ?? crypto.randomUUID());
    sessionStorage.setItem(kk, idempotencyKey);
    act.mutate({ orderId: o.id, data: { action, reason, evidenceReference, idempotencyKey,
      ...(action === 'refund' ? { confirmedNotDelivered: true } : {}) } }, {
      onSuccess: () => { delete keys.current[kk]; sessionStorage.removeItem(kk); void refresh(o.rewardId); setMsg('Handlingen er registrert.'); },
      onError: x => {
        // High-value dispatch must go through the approval queue.
        if (action === 'dispatch' && apiErrorCode(x) === 'USE_APPROVAL_QUEUE') {
          delete keys.current[kk]; sessionStorage.removeItem(kk);
          approval.send('ORDER_DISPATCH', { orderId: o.id, evidenceReference }, reason, { onQueued: r => setMsg(queuedText(r)), onError: e => setMsg(errMsg(e)) });
          return;
        }
        setMsg(errMsg(x));
      },
    });
  };
  if (q.isLoading) return <Skel className="h-40" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Oppdateres hvert 30. sekund mens siden er åpen. Ingen handling betyr automatisk levering fra leverandør; du registrerer bare utfallet.</p>
      <div aria-live="polite" className="mb-2 text-sm" data-testid="text-order-action-msg">{msg}</div>
      {q.data!.items.length === 0 ? <Empty title="Ingen bestillinger" text="Bestillinger vises når brukere har løst inn premier." /> : (
        <ul className="space-y-3">{q.data!.items.map(o => (
          <li key={o.id} className="rounded-2xl bg-white/5 p-4" data-testid={`row-admin-order-${o.id}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-bold">{o.title}</div><div className="text-xs text-muted-foreground">{fmtDate(o.createdAt)} · {nf.format(o.points)} poeng</div><div className="break-all text-[11px] text-muted-foreground">Ordre {o.id} · transaksjon {o.transactionId}</div></div><Chip k={o.status}>{ORDER[o.status]}</Chip></div>
            <p className="mt-2 break-all text-xs text-muted-foreground">Konto: {o.accountId} · leverandør: {o.supplierId} · SKU: {o.supplierSku}</p>
            {ACTIONS.filter(a => a.from.includes(o.status)).map(a => {
              const blocked = a.action === 'dispatch' && !gate;
              return (
                <details key={a.action} className="mt-2 text-sm"><summary className="cursor-pointer text-primary">{a.label}</summary>
                  {blocked ? <p className="mt-2 text-xs text-amber-200">Utsending er låst fordi innløsning er stengt.</p>
                    : <ReasonBox testid={`ord-${a.action}-${o.id}`} label={a.label} danger={a.action === 'refund'} pending={act.isPending} onSubmit={run(o, a.action)}>{a.action === 'refund' ? 'Jeg bekrefter at premien ikke er levert til brukeren.' : undefined}</ReasonBox>}
                </details>
              );
            })}
          </li>))}</ul>)}
    </div>
  );
}

function Recon() {
  const q = useReconcileV2Rewards({ query: { queryKey: getReconcileV2RewardsQueryKey() } });
  if (q.isLoading) return <Skel className="h-24" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-3" data-testid="panel-recon">
      <div className={cn('rounded-2xl p-4 text-sm font-bold', d.ok ? 'bg-emerald-400/10 text-emerald-200' : 'bg-red-400/10 text-red-200')}>{d.ok ? 'Avstemmingen er ren.' : `${d.issues.length} avvik funnet.`}</div>
      {d.issues.length > 0 && <ul className="space-y-2">{d.issues.map((i, n) => <li key={n} className="break-all rounded-xl bg-white/5 p-3 text-xs"><b>{i.code}</b> · {i.reference}</li>)}</ul>}
      <Btn variant="ghost" size="sm" onClick={() => q.refetch()} loading={q.isFetching} data-testid="button-recon-refresh">Kjør på nytt</Btn>
    </div>
  );
}
