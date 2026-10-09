import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useReverification } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, ShieldCheck } from 'lucide-react';
import {
  ApiError, confirmV2AdminRequest, getGetV2AdminEconomyQueryKey, getListV2AdminAuditQueryKey, getListV2AdminRequestsQueryKey,
  useGetV2AdminEconomy, useListV2AdminAudit, useListV2AdminRequests, useRejectV2AdminRequest,
  type V2AdminRequest, type V2EconomyConfig,
} from '@workspace/api-client-react';
import { Btn, Card, Empty, ErrorState, PageHead, Skel } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { cn } from '@/lib/utils';
import { fmtDateTime, queuedText, SignedInOnly, useApprovalRequest, useIsAdmin, useV2State, V2Frame } from './shared';

const nf = new Intl.NumberFormat('nb-NO');
const kr = (n: number) => `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(n)} kr`;
const pct = (bp: number) => `${(bp / 100).toLocaleString('nb-NO')} %`;
const inputCls = 'mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 sm:text-sm';
const ACTION: Record<string, string> = {
  POINTS_ADJUSTMENT: 'Poengjustering', POINTS_DECISION: 'Poengbeslutning', POINTS_COMPENSATION: 'Refusjon/reversering',
  OFFER_APPROVAL: 'Aktivering av kampanje', REWARD_APPROVAL: 'Aktivering av premie', ORDER_DISPATCH: 'Utsending av dyr ordre',
  ECONOMY_CONFIG: 'Endring av økonomiregler', MARKETING_BUDGET: 'Markedsbudsjett',
};
const STATUS: Record<string, [string, string]> = {
  pending: ['Venter', 'bg-amber-400/10 text-amber-200'], executed: ['Utført', 'bg-emerald-400/10 text-emerald-300'],
  rejected: ['Avvist', 'bg-red-400/10 text-red-300'], cancelled: ['Trukket tilbake', 'bg-white/10 text-muted-foreground'],
};

function describe(r: V2AdminRequest): string {
  const p = r.payload as Record<string, unknown>;
  switch (r.action) {
    case 'POINTS_ADJUSTMENT': return `${nf.format(Number(p.amount))} BP til konto ${String(p.accountId)}${p.fundingBudgetId ? ' (markedsbudsjett)' : ''}`;
    case 'POINTS_DECISION': return `${p.status === 'approved' ? 'Godkjenn' : 'Avvis'} transaksjon ${String(p.transactionId)}`;
    case 'POINTS_COMPENSATION': return `${p.type === 'REFUND' ? 'Refusjon' : 'Reversering'} av transaksjon ${String(p.transactionId)}`;
    case 'OFFER_APPROVAL': return `Kampanje ${String(p.offerId)}`;
    case 'REWARD_APPROVAL': return `Premie ${String(p.rewardId)}`;
    case 'ORDER_DISPATCH': return `Ordre ${String(p.orderId)} · bevis ${String(p.evidenceReference)}`;
    case 'MARKETING_BUDGET': return `${String(p.name)}: ${nf.format(Number(p.pointsTotal))} BP (${kr(Number(p.pointsTotal) / 100)}) til ${fmtDateTime(String(p.validUntil))}`;
    case 'ECONOMY_CONFIG': return `Standardandel ${pct(Number(p.defaultShareBp))}, maks ${pct(Number(p.maxShareBp))}, minstemargin ${pct(Number(p.minMarginBp))}, to administratorer: ${p.dualControl ? 'ja' : 'nei'}`;
    default: return JSON.stringify(p);
  }
}

function RequestRow({ r }: { r: V2AdminRequest }) {
  const qc = useQueryClient();
  const reject = useRejectV2AdminRequest();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Fresh MFA: the server answers with a Clerk reverification hint; Clerk shows the dialog and retries.
  const confirm = useReverification(async (id: string) => {
    try { return await confirmV2AdminRequest(id); } catch (e) {
      if (e instanceof ApiError && e.data && typeof e.data === 'object' && 'clerk_error' in e.data) return e.data as never;
      throw e;
    }
  });
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getListV2AdminRequestsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetV2AdminEconomyQueryKey() }),
    qc.invalidateQueries({ queryKey: getListV2AdminAuditQueryKey() }),
    qc.invalidateQueries(),
  ]);
  const doConfirm = async () => {
    setBusy(true); setMsg(null);
    try { await confirm(r.id); await refresh(); setMsg('Handlingen er utført.'); }
    catch (e) { setMsg(errMsg(e)); }
    finally { setBusy(false); }
  };
  const [label, tone] = STATUS[r.status];
  return (
    <li className="rounded-2xl bg-white/5 p-4" data-testid={`row-request-${r.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{ACTION[r.action] ?? r.action}</div>
          <div className="break-words font-bold">{describe(r)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Bedt om av {r.requestedByName || r.requestedBy} · {fmtDateTime(r.requestedAt)}</div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold', tone)}>{label}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{r.reason}</p>
      {r.note && <p className="mt-1 text-xs text-muted-foreground">Merknad: {r.note}</p>}
      {r.status === 'pending' && (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />Kan bekreftes fra {fmtDateTime(r.notBefore)}.{r.blockedReason ? ` ${r.blockedReason}` : ''}</p>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="gold" icon={<ShieldCheck className="h-4 w-4" />} disabled={!r.canConfirm} loading={busy} onClick={doConfirm} data-testid={`button-confirm-${r.id}`}>Bekreft med tofaktor</Btn>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (note.trim().length < 10) return;
            reject.mutate({ requestId: r.id, data: { note: note.trim() } }, { onSuccess: () => { void refresh(); }, onError: x => setMsg(errMsg(x)) });
          }}>
            <label className="min-w-0 flex-1 text-xs font-bold">Begrunnelse for å avvise eller trekke tilbake
              <input className={inputCls} value={note} maxLength={500} onChange={e => setNote(e.target.value)} data-testid={`input-reject-${r.id}`} /></label>
            <Btn size="sm" variant="danger" type="submit" disabled={note.trim().length < 10} loading={reject.isPending} data-testid={`button-reject-${r.id}`}>Avvis</Btn>
          </form>
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-sm">{msg}</p>}
    </li>
  );
}

function Requests() {
  const [status, setStatus] = useState<'pending' | undefined>('pending');
  const params = status ? { status } : {};
  const q = useListV2AdminRequests(params, { query: { queryKey: getListV2AdminRequestsQueryKey(params), refetchInterval: 30000 } });
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <Btn size="sm" variant={status ? 'electric' : 'ghost'} onClick={() => setStatus('pending')}>Venter</Btn>
        <Btn size="sm" variant={status ? 'ghost' : 'electric'} onClick={() => setStatus(undefined)}>Alle</Btn>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Høyrisikohandlinger utføres aldri automatisk. De kan bekreftes tidligst etter ventetiden, og bekreftelsen krever ny tofaktorverifisering. Ingen administrator kan godkjenne en fordel for egen konto.</p>
      {q.isLoading ? <Skel className="h-32" /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : q.data!.items.length === 0 ? <Empty title="Ingen forespørsler" text={status ? 'Ingenting venter på bekreftelse.' : 'Ingen høyrisikohandlinger er registrert ennå.'} />
          : <ul className="space-y-3">{q.data!.items.map(r => <RequestRow key={r.id} r={r} />)}</ul>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return <div className="rounded-2xl bg-white/5 p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-display text-xl tabular-nums">{value}</div>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}

function EconomyForm({ c }: { c: V2EconomyConfig }) {
  const approval = useApprovalRequest();
  const [v, setV] = useState({ defaultShare: c.defaultShareBp / 100, maxShare: c.maxShareBp / 100, minMargin: c.minMarginBp / 100,
    cooldown: c.highRiskCooldownMinutes, highValue: c.highValueOrderPoints, dual: c.dualControl, age: c.minAccountAgeDays,
    minVerified: c.minVerifiedPointsBeforeRedeem, perDay: c.maxRedemptionsPerDay, pointsPerDay: c.maxRedeemPointsPerDay });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof typeof v, label: string, help?: string, step = 1) => (
    <label className="block text-sm font-bold">{label}
      <input className={inputCls} type="number" step={step} value={String(v[k])} onChange={e => setV({ ...v, [k]: Number(e.target.value) })} data-testid={`input-econ-${k}`} />
      {help && <span className="text-[11px] font-normal text-muted-foreground">{help}</span>}</label>
  );
  const submit = (e: FormEvent) => {
    e.preventDefault(); setMsg(null);
    approval.send('ECONOMY_CONFIG', {
      defaultShareBp: Math.round(v.defaultShare * 100), maxShareBp: Math.round(v.maxShare * 100), minMarginBp: Math.round(v.minMargin * 100),
      highRiskCooldownMinutes: v.cooldown, highValueOrderPoints: v.highValue, dualControl: v.dual, minAccountAgeDays: v.age,
      minVerifiedPointsBeforeRedeem: v.minVerified, maxRedemptionsPerDay: v.perDay, maxRedeemPointsPerDay: v.pointsPerDay,
    }, reason.trim(), { onQueued: r => setMsg(queuedText(r)), onError: x => setMsg(errMsg(x)) });
  };
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Foreslå nye økonomiregler">
      <div className="grid gap-3 sm:grid-cols-2">
        {num('defaultShare', 'Standard brukerandel (%)', 'Eierens ramme: 30 %', 0.5)}
        {num('maxShare', 'Maks brukerandel (%)', 'Kan ikke overstige 40 %', 0.5)}
        {num('minMargin', 'Minstemargin (%)', 'Kan ikke være under 50 %', 0.5)}
        {num('cooldown', 'Ventetid høyrisiko (minutter)', 'Minst 60')}
        {num('highValue', 'Dyr ordre fra (BP)', '50 000 BP = 500 kr')}
        {num('age', 'Minste kontoalder før innløsning (dager)')}
        {num('minVerified', 'Minimum verifisert opptjening før første innløsning (BP)')}
        {num('perDay', 'Maks innløsninger per døgn')}
        {num('pointsPerDay', 'Maks innløst per døgn (BP)')}
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={v.dual} onChange={e => setV({ ...v, dual: e.target.checked })} data-testid="check-econ-dual" />
        Krev at en annen administrator bekrefter høyrisikohandlinger (aktiver når ekstra administrator er utpekt)</label>
      <label className="block text-sm font-bold">Begrunnelse (10–500 tegn)
        <textarea className={inputCls} rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} data-testid="input-econ-reason" /></label>
      <Btn type="submit" variant="gold" disabled={reason.trim().length < 10} loading={approval.isPending} data-testid="button-econ-submit">Send endring til godkjenning</Btn>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  );
}

function BudgetForm() {
  const approval = useApprovalRequest();
  const [v, setV] = useState({ name: '', purpose: '', nok: '', until: '' });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const nok = Number(v.nok);
  const ok = v.name.trim().length >= 3 && v.purpose.trim().length >= 10 && Number.isInteger(nok) && nok >= 1 && nok <= 100000 && !!v.until && reason.trim().length >= 10;
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => {
      e.preventDefault(); if (!ok) return; setMsg(null);
      approval.send('MARKETING_BUDGET', { name: v.name.trim(), purpose: v.purpose.trim(), pointsTotal: nok * 100, validUntil: new Date(`${v.until}T23:59:59`).toISOString() },
        reason.trim(), { onQueued: r => setMsg(queuedText(r)), onError: x => setMsg(errMsg(x)) });
    }}>
      <p className="text-xs text-muted-foreground">Et markedsbudsjett er en forhåndsgodkjent kostnad (f.eks. velkomstbonus eller kampanje). Det er eneste måte å gi poeng med pengeverdi uten en verifisert konvertering.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-bold">Navn<input className={inputCls} value={v.name} maxLength={120} onChange={e => setV({ ...v, name: e.target.value })} data-testid="input-budget-name" /></label>
        <label className="block text-sm font-bold">Beløp (kr)<input className={inputCls} inputMode="numeric" value={v.nok} onChange={e => setV({ ...v, nok: e.target.value })} data-testid="input-budget-nok" /></label>
        <label className="block text-sm font-bold sm:col-span-2">Formål<input className={inputCls} value={v.purpose} maxLength={500} onChange={e => setV({ ...v, purpose: e.target.value })} data-testid="input-budget-purpose" /></label>
        <label className="block text-sm font-bold">Gyldig til<input type="date" className={inputCls} value={v.until} onChange={e => setV({ ...v, until: e.target.value })} data-testid="input-budget-until" /></label>
        <label className="block text-sm font-bold">Begrunnelse<input className={inputCls} value={reason} maxLength={500} onChange={e => setReason(e.target.value)} data-testid="input-budget-reason" /></label>
      </div>
      {Number.isInteger(nok) && nok > 0 && <p className="text-xs text-muted-foreground">= {nf.format(nok * 100)} BP</p>}
      <Btn type="submit" size="sm" variant="gold" disabled={!ok} loading={approval.isPending} data-testid="button-budget-submit">Send til godkjenning</Btn>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </form>
  );
}

function Economy() {
  const q = useGetV2AdminEconomy({ query: { queryKey: getGetV2AdminEconomyQueryKey(), refetchInterval: 60000 } });
  if (q.isLoading) return <Skel className="h-48" />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const { config: c, liability: l, admins } = q.data;
  return (
    <div className="space-y-6">
      <section aria-labelledby="h-liab">
        <h2 id="h-liab" className="mb-3 font-display text-lg font-bold">Poenggjeld</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Utestående (godkjent saldo)" value={kr(l.balanceNok)} sub={`${nf.format(l.balancePoints)} BP`} />
          <Stat label="Reservert for bestillinger" value={kr(l.reservedPoints / c.pointsPerNok)} sub={`${nf.format(l.reservedPoints)} BP`} />
          <Stat label="Ventende opptjening" value={kr(l.pendingCreditNok)} sub={`${nf.format(l.pendingCreditPoints)} BP, ikke brukbart ennå`} />
        </div>
      </section>
      <section aria-labelledby="h-rules">
        <h2 id="h-rules" className="mb-3 font-display text-lg font-bold">Gjeldende regler (versjon {c.version})</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Poengverdi" value={`${c.pointsPerNok} BP = 1 kr`} />
          <Stat label="Brukerandel" value={pct(c.defaultShareBp)} sub={`maks ${pct(c.maxShareBp)}`} />
          <Stat label="Minstemargin" value={pct(c.minMarginBp)} sub="av netto partnerinntekt" />
          <Stat label="Ventetid høyrisiko" value={`${c.highRiskCooldownMinutes} min`} />
          <Stat label="Administratorer" value={admins} sub={c.dualControl ? 'To må samarbeide' : 'Én administrator, manuell bekreftelse'} />
          <Stat label="Innløsningsregler" value={`${c.minAccountAgeDays} dager`} sub={`min ${nf.format(c.minVerifiedPointsBeforeRedeem)} BP verifisert, maks ${c.maxRedemptionsPerDay}/døgn`} />
        </div>
      </section>
      <section aria-labelledby="h-budgets">
        <h2 id="h-budgets" className="mb-3 font-display text-lg font-bold">Finansiering</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Poeng finansiert av partnerinntekt" value={`${nf.format(q.data.funding.conversionPoints)} BP`} sub={kr(q.data.funding.conversionPoints / c.pointsPerNok)} />
          <Stat label="Poeng finansiert av markedsbudsjett" value={`${nf.format(q.data.funding.budgetPoints)} BP`} sub={kr(q.data.funding.budgetPoints / c.pointsPerNok)} />
        </div>
        {q.data.budgets.length === 0 ? <p className="text-sm text-muted-foreground">Ingen markedsbudsjetter. Uten budsjett kan det ikke gis poeng utenom verifiserte konverteringer.</p> : (
          <ul className="space-y-2">{q.data.budgets.map(b => (
            <li key={b.id} className="rounded-2xl bg-white/5 p-3 text-sm"><div className="flex justify-between gap-3"><b>{b.name}</b><span className="tabular-nums">{nf.format(b.pointsUsed)} / {nf.format(b.pointsTotal)} BP</span></div>
              <div className="text-xs text-muted-foreground">{b.purpose} · gyldig til {fmtDateTime(b.validUntil)}</div></li>))}</ul>)}
        <Card className="mt-3"><h3 className="mb-2 font-bold">Be om nytt markedsbudsjett</h3><BudgetForm /></Card>
      </section>
      <Card><h2 className="mb-3 font-display text-lg font-bold">Foreslå endring av regler</h2><EconomyForm key={c.version} c={c} /></Card>
    </div>
  );
}

function Audit() {
  const [before, setBefore] = useState<string[]>([]);
  const cursor = before[before.length - 1];
  const params = { limit: 50, ...(cursor ? { before: cursor } : {}) };
  const q = useListV2AdminAudit(params, { query: { queryKey: getListV2AdminAuditQueryKey(params), placeholderData: p => p } });
  if (q.isLoading) return <Skel className="h-48" />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">Revisjonsloggen kan ikke endres eller slettes. Den viser alle administrative handlinger, også oppslag.</p>
      <div className="overflow-x-auto rounded-2xl bg-white/5">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground"><tr><th className="p-2">Tid</th><th className="p-2">Aktør</th><th className="p-2">Handling</th><th className="p-2">Objekt</th></tr></thead>
          <tbody>{q.data.items.map(a => (
            <tr key={a.id} className="border-t border-white/5 align-top"><td className="whitespace-nowrap p-2">{fmtDateTime(a.createdAt)}</td>
              <td className="break-all p-2">{a.actorId}<div className="text-muted-foreground">{a.actorRole}</div></td>
              <td className="p-2 font-bold">{a.action}</td><td className="break-all p-2">{a.entityType} · {a.entityId}</td></tr>))}</tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <Btn size="sm" variant="ghost" disabled={!before.length} onClick={() => setBefore(before.slice(0, -1))}>Nyere</Btn>
        <Btn size="sm" variant="ghost" disabled={!q.data.nextBefore} onClick={() => setBefore([...before, q.data!.nextBefore!])}>Eldre</Btn>
      </div>
    </div>
  );
}

const TABS = [['requests', 'Godkjenninger'], ['economy', 'Økonomi'], ['audit', 'Revisjonslogg']] as const;

function Hub() {
  const s = useV2State();
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<typeof TABS[number][0]>('requests');
  if (s.isLoading) return <Skel className="h-48" />;
  if (!isAdmin) return <Empty title="Ingen tilgang" text="Denne siden er kun for administratorer." action={<Link href="/account"><Btn variant="ghost">Til oversikten</Btn></Link>} />;
  return (
    <>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Admin-verktøy">
        <Link href="/account/points/admin" className="rounded-full bg-white/5 px-3 py-1.5">Poeng</Link>
        <Link href="/account/offers/admin" className="rounded-full bg-white/5 px-3 py-1.5">Kampanjer</Link>
        <Link href="/account/rewards/admin" className="rounded-full bg-white/5 px-3 py-1.5">Premier og ordre</Link>
      </nav>
      <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-white/5 p-1 text-sm">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={cn('whitespace-nowrap rounded-full px-4 py-2 font-bold', tab === k ? 'btn-electric' : 'text-muted-foreground')} onClick={() => setTab(k)} data-testid={`tab-admin-${k}`}>{l}</button>)}
      </div>
      {tab === 'requests' && <Requests />}
      {tab === 'economy' && <Economy />}
      {tab === 'audit' && <Audit />}
    </>
  );
}

export function AdminHubPage() {
  return (
    <SignedInOnly>
      <V2Frame nav title="Administrasjon" desc="Godkjenninger, økonomiregler og revisjonslogg.">
        <PageHead eyebrow="Admin" title="Administrasjon" sub="Godkjenn høyrisikohandlinger, følg poenggjelden og se revisjonsloggen." />
        <Hub />
      </V2Frame>
    </SignedInOnly>
  );
}
