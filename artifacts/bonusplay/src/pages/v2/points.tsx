import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Redirect } from 'wouter';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  getGetV2AdminWalletQueryKey, getGetV2WalletQueryKey, getListV2AdminTransactionsQueryKey, getListV2TransactionsQueryKey,
  useAdjustV2Points, useCompensateV2Points, useDecideV2Points, useGetV2AdminWallet, useGetV2Wallet, useListV2AdminTransactions, useListV2Transactions,
  type V2PointsResult, type V2PointsTransaction, type V2Wallet,
} from '@workspace/api-client-react';
import { AnimatedNumber, Btn, Card, Empty, ErrorState, PageHead, PageSkeleton, Skel } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { cn } from '@/lib/utils';
import { SignedInOnly, useV2State, V2Frame } from './shared';
import { updatePointsCaches } from './points-cache';

const PAGE = 20;
const inputCls = 'mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-primary';
const nf = new Intl.NumberFormat('nb-NO');
const fmtDT = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }); };
const STATUS: Record<string, string> = { pending: 'Venter', approved: 'Godkjent', rejected: 'Avvist', reversed: 'Reversert' };
const TYPE: Record<string, string> = { EARN: 'Opptjening', REDEEM: 'Innløsning', REFERRAL: 'Vervebonus', BONUS: 'Bonus', ADJUSTMENT: 'Justering', REFUND: 'Refusjon', REVERSAL: 'Reversering', EXPIRATION: 'Utløp' };
const tone: Record<string, string> = { pending: 'text-amber-200 bg-amber-400/10', approved: 'text-emerald-300 bg-emerald-400/10', rejected: 'text-red-300 bg-red-400/10', reversed: 'text-violet-300 bg-violet-400/10' };

const useIdemKey = () => {
  const ref = useRef<{ intent: string; key: string } | null>(null);
  return {
    get: (intent: string) => {
      if (!ref.current || ref.current.intent !== intent) ref.current = { intent, key: crypto.randomUUID() };
      return ref.current.key;
    },
    reset: () => { ref.current = null; },
  };
};

function useRole() {
  const { isLoaded, isSignedIn } = useAuth();
  const s = useV2State();
  const acc = s.data?.account ?? null;
  return { s, acc, enrolled: !!acc && acc.status === 'ACTIVE', ready: isLoaded && !!isSignedIn, isAdmin: !!acc && (acc.role === 'ADMIN' || acc.role === 'SUPER_ADMIN') };
}

function Stat({ k, v, hero }: { k: string; v: number; hero?: boolean }) {
  return (
    <div className={cn('rounded-2xl bg-white/5 p-3', hero && 'col-span-2 bg-gradient-to-br from-primary/20 to-accent/10 p-4')}>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={cn('font-display font-bold tabular-nums', hero ? 'gold-text text-4xl' : 'text-lg')}><AnimatedNumber value={v} /></div>
    </div>
  );
}

function WalletView({ w, label }: { w: V2Wallet; label: string }) {
  return (
    <Card glow className="rise" data-testid="card-wallet" aria-label={label}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat hero k="Tilgjengelig BonusPoints" v={w.available} />
        <Stat k="Saldo" v={w.balance} /><Stat k="Venter" v={w.pending} /><Stat k="Reservert" v={w.reserved} />
        <Stat k="Opptjent totalt" v={w.lifetimeEarned} /><Stat k="Brukt totalt" v={w.lifetimeRedeemed} />
      </div>
      <p className="mt-3 break-all text-[11px] text-muted-foreground">Konto-ID: <span data-testid="text-wallet-account">{w.accountId}</span></p>
    </Card>
  );
}

function TxRow({ t, actions }: { t: V2PointsTransaction; actions?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const neg = t.amount < 0;
  return (
    <li className="rounded-2xl bg-white/5 p-3 transition-colors hover:bg-white/[.08]" data-testid={`row-tx-${t.id}`}>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open} onClick={() => setOpen(!open)} data-testid={`button-tx-${t.id}`}>
        <span className="min-w-0">
          <span className="block text-sm font-bold">{TYPE[t.type] ?? t.type} <span className={cn('ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold', tone[t.status])}>{STATUS[t.status] ?? t.status}</span></span>
          <span className="block truncate text-xs text-muted-foreground">{t.description || t.source}</span>
          <span className="block text-[11px] text-muted-foreground">{fmtDT(t.createdAt)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <b className={cn('font-display tabular-nums', neg ? 'text-red-300' : 'text-emerald-300')}>{neg ? '' : '+'}{nf.format(t.amount)}</b>
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="rise mt-3 space-y-3 border-t border-white/10 pt-3 text-xs">
          <dl className="grid gap-1 sm:grid-cols-2">
            {([['Transaksjons-ID', t.id], ['Sekvens', t.sequence], ['Konto-ID', t.accountId], ['Kilde', t.source], ['Referanse', t.reference], ['Årsak', t.reason || '-'], ['Relatert transaksjon', t.relatedTransactionId ?? '-'], ['Utført av', t.actorId], ['Opprettet', fmtDT(t.createdAt)], ['Oppdatert', fmtDT(t.updatedAt)]] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all font-bold">{v}</dd></div>
            ))}
          </dl>
          <div>
            <h4 className="mb-1 font-bold">Hendelsesforløp</h4>
            {t.events.length === 0 ? <p className="text-muted-foreground">Ingen hendelser.</p> : (
              <ol className="space-y-1 border-l border-primary/40 pl-3">
                {t.events.map((e, i) => (
                  <li key={i} data-testid={`event-${t.id}-${i}`}>
                    <b>{STATUS[e.status] ?? e.status}</b> · saldo {e.delta > 0 ? '+' : ''}{nf.format(e.delta)} · reservert {e.reservedDelta > 0 ? '+' : ''}{nf.format(e.reservedDelta)}
                    <span className="block text-muted-foreground">{fmtDT(e.createdAt)} · {e.actorId} · {e.reason}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {actions}
        </div>
      )}
    </li>
  );
}

function History({ q, cursors, setCursors, renderActions }: {
  q: { isLoading: boolean; isError: boolean; error: unknown; data?: { items: V2PointsTransaction[]; nextCursor: string | null }; refetch: () => unknown; isFetching: boolean };
  cursors: string[]; setCursors: (c: string[]) => void; renderActions?: (t: V2PointsTransaction) => ReactNode;
}) {
  if (q.isLoading) return <div className="space-y-2" aria-busy="true"><Skel className="h-16" /><Skel className="h-16" /><Skel className="h-16" /></div>;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const items = [...new Map(q.data.items.map((t) => [t.id, t])).values()];
  const next = q.data.nextCursor;
  return (
    <div className={cn('transition-opacity', q.isFetching && 'opacity-60')}>
      {items.length === 0 ? <Empty title="Ingen transaksjoner ennå" text="Når poeng bokføres, vises hver transaksjon her med full sporbarhet." /> : (
        <ul className="space-y-2" data-testid="list-transactions">{items.map((t) => <TxRow key={t.id} t={t} actions={renderActions?.(t)} />)}</ul>
      )}
      <div className="mt-4 flex items-center justify-between">
        <Btn size="sm" variant="ghost" disabled={q.isFetching || cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))} data-testid="button-prev"><ChevronLeft className="h-4 w-4" />Forrige</Btn>
        <span className="text-xs text-muted-foreground">Side {cursors.length + 1}</span>
        <Btn size="sm" variant="ghost" disabled={q.isFetching || !next} onClick={() => next && setCursors([...cursors, next])} data-testid="button-next">Neste<ChevronRight className="h-4 w-4" /></Btn>
      </div>
    </div>
  );
}

function Gate({ children }: { children: (r: ReturnType<typeof useRole>) => ReactNode }) {
  const r = useRole();
  if (r.s.isLoading) return <PageSkeleton />;
  if (r.s.isError || !r.s.data) return <ErrorState message={errMsg(r.s.error)} onRetry={() => r.s.refetch()} />;
  if (!r.enrolled) return <Redirect to="/account" />;
  return <>{children(r)}</>;
}

function Own({ ready }: { ready: boolean }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const params = { limit: PAGE, ...(cursor ? { cursor } : {}) };
  const w = useGetV2Wallet({ query: { enabled: ready, queryKey: getGetV2WalletQueryKey(), staleTime: 15000, refetchInterval: 60000 } });
  const h = useListV2Transactions(params, { query: { enabled: ready, queryKey: getListV2TransactionsQueryKey(params), staleTime: 15000, refetchInterval: 60000, placeholderData: (p) => p } });
  return (
    <>
      {w.isLoading ? <Skel className="h-48" /> : w.isError || !w.data ? <ErrorState message={errMsg(w.error)} onRetry={() => w.refetch()} /> : <WalletView w={w.data} label="Din saldo" />}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Historikk</h2>
      <History q={h} cursors={cursors} setCursors={setCursors} />
    </>
  );
}

export function PointsPage() {
  return (
    <SignedInOnly>
      <V2Frame nav title="BonusPoints" desc="Se nøyaktig hvor hver BonusPoint kom fra.">
        <PageHead eyebrow="Poeng" title="BonusPoints" sub="Hver poengbevegelse på kontoen din, med kilde, status og hendelsesforløp." />
        <Gate>{(r) => <Own ready={r.ready} />}</Gate>
      </V2Frame>
    </SignedInOnly>
  );
}

type Act = { kind: 'approved' | 'rejected' | 'REFUND' | 'REVERSAL'; label: string };

function ActionPanel({ t, act, onDone }: { t: V2PointsTransaction; act: Act; onDone: () => void }) {
  const qc = useQueryClient();
  const decide = useDecideV2Points();
  const comp = useCompensateV2Points();
  const idem = useIdemKey();
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<V2PointsResult | null>(null);
  const m = act.kind === 'approved' || act.kind === 'rejected' ? decide : comp;
  const r = reason.trim();
  const valid = r.length >= 10 && r.length <= 500;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || m.isPending) return;
    const key = idem.get(`${t.id}:${act.kind}:${r}`);
    const ok = async (res: V2PointsResult) => {
      await updatePointsCaches(qc, res);
      idem.reset(); setDone(res);
    };
    if (act.kind === 'approved' || act.kind === 'rejected') decide.mutate({ transactionId: t.id, data: { status: act.kind, reason: r, idempotencyKey: key } }, { onSuccess: ok });
    else comp.mutate({ transactionId: t.id, data: { type: act.kind, reason: r, idempotencyKey: key } }, { onSuccess: ok });
  };
  if (done) return (
    <div role="status" className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-300"><CheckCircle2 className="mr-1 inline h-4 w-4" />{done.replayed ? 'Handlingen var allerede utført.' : 'Handlingen er utført.'} Transaksjon {done.transaction.id}, status {STATUS[done.transaction.status]}. Ny saldo: {nf.format(done.wallet.balance)}.
      <button type="button" className="ml-2 underline" onClick={onDone}>Lukk</button></div>
  );
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-white/10 p-3">
      <b className="text-sm">{act.label}</b>
      {(act.kind === 'REFUND' || act.kind === 'REVERSAL') && <p className="text-muted-foreground">Hele beløpet ({nf.format(Math.abs(t.amount))}) beregnes av serveren. Du kan ikke angi beløp.</p>}
      <label className="block font-bold">Begrunnelse (10-500 tegn)<textarea className={inputCls} rows={3} maxLength={500} value={reason} disabled={m.isPending} onChange={(e) => setReason(e.target.value)} data-testid={`input-reason-${t.id}`} /></label>
      <div className="text-[11px] text-muted-foreground">{r.length}/500</div>
      {m.isError && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-2 text-destructive">{errMsg(m.error)} Du kan prøve igjen; samme forespørsel gjenbrukes trygt.</div>}
      <div className="flex gap-2"><Btn size="sm" type="submit" disabled={!valid} loading={m.isPending} data-testid={`button-confirm-${t.id}`}>Bekreft</Btn><Btn size="sm" variant="ghost" disabled={m.isPending} onClick={onDone}>Avbryt</Btn></div>
    </form>
  );
}

function TxActions({ t }: { t: V2PointsTransaction }) {
  const [act, setAct] = useState<Act | null>(null);
  const comp = t.type === 'REFUND' || t.type === 'REVERSAL';
  const acts: Act[] = [];
  if (t.source.startsWith('offer:')) return <div className="text-xs text-muted-foreground">Tilbudspoeng vurderes og reverseres i <Link href="/account/offers/admin" className="text-primary underline">tilbudskontrollen</Link>, slik at partnerbevis og konverteringshistorikk beholdes.</div>;
  if (t.status === 'pending') acts.push({ kind: 'approved', label: 'Godkjenn transaksjon' }, { kind: 'rejected', label: 'Avvis transaksjon' });
  if (t.status === 'approved' && t.amount < 0 && !comp) acts.push({ kind: 'REFUND', label: 'Full refusjon' });
  if (t.status === 'approved' && !comp) acts.push({ kind: 'REVERSAL', label: 'Full reversering' });
  if (acts.length === 0) return null;
  if (act) return <ActionPanel key={act.kind} t={t} act={act} onDone={() => setAct(null)} />;
  return <div className="flex flex-wrap gap-2">{acts.map((a) => <Btn key={a.kind} size="sm" variant={a.kind === 'rejected' || a.kind === 'REVERSAL' ? 'danger' : 'ghost'} onClick={() => setAct(a)} data-testid={`button-${a.kind}-${t.id}`}>{a.label}</Btn>)}</div>;
}

function Adjust({ accountId }: { accountId: string }) {
  const qc = useQueryClient();
  const adj = useAdjustV2Points();
  const idem = useIdemKey();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<V2PointsResult | null>(null);
  const n = Number(amount);
  const amtOk = amount.trim() !== '' && Number.isInteger(n) && n !== 0 && Math.abs(n) <= 1000000;
  const r = reason.trim();
  const valid = amtOk && r.length >= 10 && r.length <= 500;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || adj.isPending) return;
    setDone(null);
    adj.mutate({ accountId, data: { amount: n, reason: r, idempotencyKey: idem.get(`${accountId}:${n}:${r}`) } }, {
      onSuccess: async (res) => {
        await updatePointsCaches(qc, res);
        idem.reset(); setDone(res); setAmount(''); setReason('');
      },
    });
  };
  return (
    <form onSubmit={submit} className="mt-8" aria-label="Poengjustering">
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold">Juster poeng</h2>
        <label className="block text-sm font-bold">Beløp (heltall, positivt eller negativt, maks 1 000 000)
          <input className={inputCls} inputMode="numeric" value={amount} disabled={adj.isPending} onChange={(e) => setAmount(e.target.value)} aria-invalid={amount !== '' && !amtOk} data-testid="input-amount" /></label>
        {amount !== '' && !amtOk && <p className="text-xs text-destructive">Oppgi et heltall som ikke er 0, mellom -1 000 000 og 1 000 000.</p>}
        <label className="block text-sm font-bold">Begrunnelse (10-500 tegn)
          <textarea className={inputCls} rows={3} maxLength={500} value={reason} disabled={adj.isPending} onChange={(e) => setReason(e.target.value)} data-testid="input-adjust-reason" /></label>
        <div className="text-[11px] text-muted-foreground">{r.length}/500</div>
        <div aria-live="polite">
          {adj.isError && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errMsg(adj.error)} Du kan trygt prøve igjen.</div>}
          {done && <div className="flex items-center gap-2 text-sm text-emerald-300" data-testid="text-adjust-success"><CheckCircle2 className="h-4 w-4" />{done.replayed ? 'Justeringen var allerede bokført.' : 'Justering bokført.'} Transaksjon {done.transaction.id}. Saldo etter denne justeringen: {nf.format(done.wallet.balance)}.</div>}
        </div>
        <Btn type="submit" variant="gold" disabled={!valid} loading={adj.isPending} data-testid="button-adjust">Bokfør justering</Btn>
      </Card>
    </form>
  );
}

function Lookup({ accountId, enabled }: { accountId: string; enabled: boolean }) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const params = { limit: PAGE, ...(cursor ? { cursor } : {}) };
  const w = useGetV2AdminWallet(accountId, { query: { enabled, queryKey: getGetV2AdminWalletQueryKey(accountId), staleTime: 10000, refetchInterval: 60000 } });
  const h = useListV2AdminTransactions(accountId, params, { query: { enabled, queryKey: getListV2AdminTransactionsQueryKey(accountId, params), staleTime: 10000, refetchInterval: 60000, placeholderData: (p) => p } });
  return (
    <div className="mt-6">
      {w.isLoading ? <Skel className="h-48" /> : w.isError || !w.data ? <ErrorState message={errMsg(w.error)} onRetry={() => w.refetch()} /> : <WalletView w={w.data} label="Kontoens saldo" />}
      <h2 className="mb-3 mt-8 font-display text-lg font-bold">Historikk</h2>
      <History q={h} cursors={cursors} setCursors={setCursors} renderActions={(t) => <TxActions t={t} />} />
      {w.data && !w.isError && <Adjust accountId={accountId} />}
    </div>
  );
}

function AdminBody({ r }: { r: ReturnType<typeof useRole> }) {
  const [input, setInput] = useState('');
  const [id, setId] = useState('');
  if (!r.isAdmin) return <Empty title="Ingen tilgang" text="Denne siden er kun for administratorer." action={<Link href="/account/points"><Btn variant="ghost">Til mine poeng</Btn></Link>} />;
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); setId(input.trim()); }} className="flex items-end gap-2" role="search">
        <label className="block flex-1 text-sm font-bold">Konto-ID<input className={inputCls} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Lim inn konto-ID" data-testid="input-account-id" /></label>
        <Btn type="submit" disabled={!input.trim()} icon={<Search className="h-4 w-4" />} data-testid="button-lookup">Søk</Btn>
      </form>
      {id ? <Lookup key={id} accountId={id} enabled={r.ready && r.isAdmin && r.enrolled} /> : <div className="mt-6"><Empty title="Slå opp en konto" text="Oppgi konto-ID for å se saldo, historikk og utføre handlinger." /></div>}
    </>
  );
}

export function PointsAdminPage() {
  return (
    <SignedInOnly>
      <V2Frame nav title="Poengadministrasjon" desc="Administrer BonusPoints for en konto.">
        <PageHead eyebrow="Admin" title="Poengadministrasjon" sub="Alle handlinger krever begrunnelse og logges med hendelsesforløp." />
        <Gate>{(r) => <AdminBody r={r} />}</Gate>
      </V2Frame>
    </SignedInOnly>
  );
}
