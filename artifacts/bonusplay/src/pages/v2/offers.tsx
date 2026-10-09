import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, ExternalLink, Lock, ShieldAlert } from 'lucide-react';
import {
  getGetV2OfferQueryKey, getGetV2WalletQueryKey, getListV2AdminConversionsQueryKey, getListV2AdminOffersQueryKey,
  getListV2ConversionsQueryKey, getListV2OfferPartnersQueryKey, getListV2OffersQueryKey,
  useCreateV2Offer, useGetV2Offer, useListV2AdminConversions, useListV2AdminOffers, useListV2Conversions, useListV2OfferPartners,
  useListV2Offers, useReviewV2Conversion, useReviewV2Offer, useStartV2Offer,
  type V2Conversion, type V2Offer, type V2OfferInput,
} from '@workspace/api-client-react';
import { Btn, Card, Empty, ErrorState, PageHead, Skel } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { cn } from '@/lib/utils';
import { fmtDate, queuedText, ScrollTop, SignedInOnly, useApprovalRequest, useV2State, V2Frame } from './shared';
import { ReversalHistory, ReverseConversionForm } from './offer-reversal';

const nf = new Intl.NumberFormat('nb-NO');
const inputCls = 'mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/40 sm:text-sm';
const CONV: Record<string, string> = { pending: 'Venter på vurdering', verified: 'Verifisert', rejected: 'Avvist', reversed: 'Tilbakeført' };
const PARTNER: Record<string, string> = { pending: 'Partner: ingen bekreftelse ennå', verified: 'Partner: bekreftet', rejected: 'Partner: avvist' };
const OFFER: Record<string, string> = { draft: 'Utkast', approved: 'Godkjent', rejected: 'Avvist / pauset' };
const CATEGORIES: Record<V2OfferInput['category'], string> = { shopping: 'Shopping', subscriptions: 'Abonnementer', surveys: 'Undersøkelser', apps: 'Apper', services: 'Tjenester', finance: 'Finans', travel: 'Reise', food: 'Mat', entertainment: 'Underholdning', other: 'Annet' };
const tone: Record<string, string> = { pending: 'bg-amber-400/10 text-amber-200', verified: 'bg-emerald-400/10 text-emerald-300', approved: 'bg-emerald-400/10 text-emerald-300', rejected: 'bg-red-400/10 text-red-300', reversed: 'bg-red-400/10 text-red-300', draft: 'bg-sky-400/10 text-sky-200' };

function useGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const s = useV2State();
  const acc = s.data?.account ?? null;
  const active = isLoaded && !!isSignedIn && !!acc && acc.status === 'ACTIVE';
  return { s, acc, active, isAdmin: active && (acc?.role === 'ADMIN' || acc?.role === 'SUPER_ADMIN') };
}

function Chip({ k, children }: { k: string; children: ReactNode }) {
  return <span className={cn('inline-block rounded-full px-2.5 py-1 text-[11px] font-bold', tone[k])}>{children}</span>;
}
function L({ id, t, children }: { id: string; t: string; children: ReactNode }) {
  return <div><label htmlFor={id} className="text-sm font-bold">{t}</label>{children}</div>;
}

function Gate({ children }: { children: (g: ReturnType<typeof useGate>) => ReactNode }) {
  const g = useGate();
  if (g.s.isLoading) return <Skel className="h-40" />;
  if (g.s.isError) return <ErrorState message={errMsg(g.s.error)} onRetry={() => g.s.refetch()} />;
  if (!g.active) return <Empty icon={<Lock />} title="Konto må være aktiv" text="Tilbud krever en registrert og aktiv BONUSPLAY-konto." action={<Link href="/account"><Btn variant="ghost">Til kontooversikt</Btn></Link>} />;
  return <>{children(g)}</>;
}

function EarnOff() {
  return (
    <div className="mb-5 flex gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100" role="status" data-testid="notice-earn-off">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <p><b>Opptjening er ikke aktivert.</b> Tilbudene er klargjort, men kan ikke startes før de tidligere sikkerhets- og innloggingskontrollene (sikkerhetsgjennomgang og innloggingskrav for V2) er godkjent og driften har åpnet opptjening. Ingen poeng gis før da.</p>
    </div>
  );
}

function OfferCard({ o, i }: { o: V2Offer; i: number }) {
  return (
    <Link href={`/account/offers/${o.id}`} className="group block rise" style={{ animationDelay: `${i * 50}ms` }} data-testid={`card-offer-${o.id}`}>
      <Card className="transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[.98]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{o.partnerName}</div>
            <h3 className="font-display text-base font-bold">{o.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{o.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">{CATEGORIES[o.category as V2OfferInput['category']]} · ca. {o.estimatedMinutes} min · vurdering innen ca. {o.approvalDays} dager</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.requirements}</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.expiresAt ? `Utløper ${fmtDate(o.expiresAt)}` : 'Ingen fast utløpsdato'}</p>
          </div>
          <div className="shrink-0 text-right"><div className="gold-text font-display text-xl font-bold tabular-nums">{nf.format(o.points)}</div><div className="text-[11px] text-muted-foreground">poeng</div></div>
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs font-bold text-primary">Se detaljer <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden /></div>
      </Card>
    </Link>
  );
}

function ConvRow({ c }: { c: V2Conversion }) {
  return (
    <li className="rounded-2xl bg-white/5 p-3" data-testid={`row-conversion-${c.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="font-bold">{c.offerTitle}</div><div className="text-xs text-muted-foreground">{fmtDate(c.createdAt)} · {nf.format(c.points)} poeng</div></div>
        <Chip k={c.status}>{CONV[c.status]}</Chip>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{PARTNER[c.partnerStatus]}{c.partnerStatus === 'verified' && c.status === 'pending' ? ' - venter på manuell vurdering' : ''}</div>
      <ReversalHistory conversion={c} />
    </li>
  );
}

function List({ limitNote, children }: { limitNote: string; children: ReactNode }) {
  return <div><p className="mb-2 text-xs text-muted-foreground">{limitNote}</p>{children}</div>;
}

export function OffersPage() {
  return <SignedInOnly><V2Frame nav title="Tilbud" desc="Godkjente tilbud og din konverteringshistorikk."><ScrollTop /><OffersBody /></V2Frame></SignedInOnly>;
}

function OffersBody() {
  return (
    <>
      <PageHead eyebrow="Konto" title="Tilbud" sub="Godkjente partnertilbud og dine egne konverteringer." />
      <Gate>{g => <OffersInner admin={g.isAdmin} />}</Gate>
    </>
  );
}

function OffersInner({ admin }: { admin: boolean }) {
  const offers = useListV2Offers({ query: { queryKey: getListV2OffersQueryKey() } });
  const convs = useListV2Conversions({ query: { queryKey: getListV2ConversionsQueryKey(), refetchInterval: 30000 } });
  const items = offers.data?.items.filter(o => o.status === 'approved') ?? [];
  return (
    <div className="space-y-8">
      {offers.data && !offers.data.earnEnabled && <EarnOff />}
      {admin && <Link href="/account/offers/admin" className="inline-block text-sm font-bold text-primary underline" data-testid="link-offers-admin">Tilbudsadministrasjon</Link>}
      <section aria-labelledby="h-offers">
        <h2 id="h-offers" className="mb-2 font-display text-lg font-bold">Godkjente tilbud</h2>
        <List limitNote="Viser de siste 100 godkjente tilbudene.">
          {offers.isLoading ? <div className="space-y-3"><Skel className="h-28" /><Skel className="h-28" /></div>
            : offers.isError ? <ErrorState message={errMsg(offers.error)} onRetry={() => offers.refetch()} />
            : items.length === 0 ? <Empty title="Ingen godkjente tilbud" text="Det finnes ingen godkjente tilbud akkurat nå. Tilbud vises her når de er vurdert av en administrator." />
            : <div className="space-y-3">{items.map((o, i) => <OfferCard key={o.id} o={o} i={i} />)}</div>}
        </List>
      </section>
      <section aria-labelledby="h-conv">
        <h2 id="h-conv" className="mb-2 font-display text-lg font-bold">Mine konverteringer</h2>
        <List limitNote="Viser de siste 100 konverteringene dine. Oppdateres automatisk hvert 30. sekund.">
          {convs.isLoading ? <Skel className="h-20" />
            : convs.isError ? <ErrorState message={errMsg(convs.error)} onRetry={() => convs.refetch()} />
            : convs.data!.items.length === 0 ? <Empty title="Ingen konverteringer ennå" text="Når du har startet og fullført et tilbud, vises statusen her." />
            : <ul className="space-y-2">{convs.data!.items.map(c => <ConvRow key={c.id} c={c} />)}</ul>}
        </List>
      </section>
    </div>
  );
}

export function OfferDetailPage() {
  return <SignedInOnly><V2Frame nav title="Tilbudsdetaljer" desc="Detaljer og start for et tilbud."><ScrollTop /><Gate>{() => <DetailInner />}</Gate></V2Frame></SignedInOnly>;
}

function DetailInner() {
  const { offerId = '' } = useParams<{ offerId: string }>();
  const q = useGetV2Offer(offerId, { query: { enabled: !!offerId, queryKey: getGetV2OfferQueryKey(offerId) } });
  const start = useStartV2Offer();
  const keyRef = useRef<{ offerId: string; key: string } | null>(null);
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  const getKey = () => {
    if (!keyRef.current || keyRef.current.offerId !== offerId) keyRef.current = { offerId, key: crypto.randomUUID() };
    return keyRef.current.key;
  };
  if (q.isLoading) return <div className="space-y-3"><Skel className="h-10" /><Skel className="h-48" /></div>;
  if (q.isError || !q.data) return <ErrorState message={q.error ? errMsg(q.error) : 'Fant ikke tilbudet.'} onRetry={() => q.refetch()} />;
  const { offer, earnEnabled } = q.data;
  const canStart = earnEnabled && offer.status === 'approved';
  const url = start.data?.redirectUrl;
  const safe = !!url && /^https:\/\//i.test(url);
  const run = () => start.mutate({ offerId, data: { idempotencyKey: getKey() } });
  return (
    <div className="space-y-5">
      <Link href="/account/offers" className="text-sm text-muted-foreground underline" data-testid="link-back-offers">Tilbake til tilbud</Link>
      <PageHead eyebrow={offer.partnerName} title={offer.title} sub={`${nf.format(offer.points)} poeng ved verifisert gjennomføring`} />
      {!earnEnabled && <EarnOff />}
      {offer.status !== 'approved' && <Chip k={offer.status}>{OFFER[offer.status]}</Chip>}
      <Card><h2 className="mb-1 font-bold">Beskrivelse</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground">{offer.description}</p></Card>
      <Card><h2 className="mb-1 font-bold">Krav og gjennomføring</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground">{offer.requirements}</p><p className="mt-3 whitespace-pre-wrap text-sm">{offer.completionSteps}</p><p className="mt-3 text-xs text-muted-foreground">Beregnet tid: {offer.estimatedMinutes} min. Forventet vurdering: ca. {offer.approvalDays} dager. {offer.expiresAt ? `Utløper ${fmtDate(offer.expiresAt)}.` : 'Ingen fast utløpsdato.'}</p></Card>
      <Card><h2 className="mb-1 font-bold">Slik spores tilbudet</h2><p className="break-words text-sm text-muted-foreground">Destinasjon: {new URL(offer.destinationUrl).hostname}. Ved start lagrer vi en unik klikkreferanse og sender den som bp_click i partnerlenken. Partneren sender signert bevis tilbake; ventende poeng kan ikke brukes. Ingen klikk alene gir poeng.</p></Card>
      <Card><h2 className="mb-1 font-bold">Vilkår</h2><p className="whitespace-pre-wrap text-sm text-muted-foreground" data-testid="text-offer-terms">{offer.terms}</p></Card>
      <Card glow>
        <h2 className="mb-2 font-bold">Start tilbudet</h2>
        <div className="mb-3 flex gap-2 rounded-xl bg-white/5 p-3 text-sm"><ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><p>Du forlater BONUSPLAY og går til en ekstern nettside som drives av {offer.partnerName}. Deres vilkår og personvern gjelder der. Poeng krediteres først etter at partneren har bekreftet og en administrator har verifisert gjennomføringen.</p></div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[hsl(217_100%_60%)]" checked={ack} onChange={e => setAck(e.target.checked)} disabled={!canStart} data-testid="check-external-ack" />
          <span>Jeg forstår at jeg sendes til en ekstern nettside og har lest vilkårene.</span>
        </label>
        <div className="mt-4"><Btn variant="gold" shine loading={start.isPending} disabled={!canStart || !ack || start.isPending} onClick={run} data-testid="button-start-offer">{start.isError ? 'Prøv igjen' : 'Start tilbud'}</Btn></div>
        {!canStart && <p className="mt-2 text-xs text-muted-foreground">{earnEnabled ? 'Tilbudet er ikke godkjent og kan ikke startes.' : 'Start er deaktivert til opptjening er aktivert.'}</p>}
        <div aria-live="polite">
          {start.isError && <p className="mt-3 text-sm text-red-300" role="alert" data-testid="text-start-error">{errMsg(start.error)} Forsøket bruker samme nøkkel, så det oppstår ikke dobbelt klikk.</p>}
          {start.data && (safe ? (
            <div className="animate-pop mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4" data-testid="panel-start-confirm">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-200"><Check className="h-4 w-4" aria-hidden /> Klikk registrert. Referanse {start.data.clickId}</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="bp-btn btn-electric px-5 py-3 text-sm" data-testid="link-offer-redirect">Åpne partnerens side <ExternalLink className="h-4 w-4" aria-hidden /></a>
              <button type="button" className="ml-3 text-xs underline" onClick={() => { void navigator.clipboard?.writeText(url!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }} data-testid="button-copy-redirect">{copied ? 'Kopiert' : 'Kopier lenke'}</button>
            </div>
          ) : <p className="mt-3 text-sm text-red-300" role="alert">Mottatt lenke er ikke en sikker HTTPS-adresse og vises ikke.</p>)}
        </div>
      </Card>
    </div>
  );
}

export function OffersAdminPage() {
  return <SignedInOnly><V2Frame nav title="Tilbudsadmin" desc="Opprett og vurder tilbud og konverteringer."><ScrollTop /><PageHead eyebrow="Admin" title="Tilbudsadministrasjon" sub="Opprett utkast, vurder tilbud og konverteringer." /><Gate>{g => g.isAdmin ? <AdminInner /> : <Empty icon={<Lock />} title="Kun for administratorer" text="Du trenger rollen ADMIN eller SUPER_ADMIN." />}</Gate></V2Frame></SignedInOnly>;
}

function useInvalidate() {
  const qc = useQueryClient();
  return {
    offers: (id?: string) => Promise.all([
      qc.invalidateQueries({ queryKey: getListV2OffersQueryKey() }),
      qc.invalidateQueries({ queryKey: getListV2AdminOffersQueryKey() }),
      ...(id ? [qc.invalidateQueries({ queryKey: getGetV2OfferQueryKey(id) })] : []),
    ]),
    conversions: () => Promise.all([
      qc.invalidateQueries({ queryKey: getListV2ConversionsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListV2AdminConversionsQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetV2WalletQueryKey() }),
      qc.invalidateQueries({ predicate: q => { const k = q.queryKey[0]; return typeof k === 'string' && /^\/api\/v2\/(admin\/)?(wallet|transactions|accounts)/.test(k); } }),
    ]),
  };
}

function ReasonBox({ onSubmit, label, pending, danger, disabled, testid }: { onSubmit: (r: string) => void; label: string; pending: boolean; danger?: boolean; disabled?: boolean; testid: string }) {
  const [r, setR] = useState('');
  const ok = r.trim().length >= 10 && r.trim().length <= 500;
  return (
    <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e: FormEvent) => { e.preventDefault(); if (ok) onSubmit(r.trim()); }}>
      <label className="sr-only" htmlFor={testid}>Begrunnelse (minst 10 tegn)</label>
      <input id={testid} className={cn(inputCls, 'mt-0 flex-1')} placeholder="Begrunnelse, minst 10 tegn" value={r} maxLength={500} onChange={e => setR(e.target.value)} data-testid={`input-${testid}`} />
      <Btn type="submit" size="sm" variant={danger ? 'danger' : 'electric'} loading={pending} disabled={!ok || pending || disabled} data-testid={`button-${testid}`}>{label}</Btn>
    </form>
  );
}

function AdminInner() {
  const [tab, setTab] = useState<'create' | 'offers' | 'conv'>('offers');
  const tabs: [typeof tab, string][] = [['offers', 'Tilbud'], ['conv', 'Konverteringer'], ['create', 'Nytt utkast']];
  return (
    <div>
      <div role="tablist" aria-label="Admin" className="mb-5 flex gap-1 rounded-full bg-white/5 p-1 text-sm">
        {tabs.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} className={cn('flex-1 rounded-full px-3 py-2 font-bold transition', tab === k ? 'btn-electric' : 'text-muted-foreground')} onClick={() => setTab(k)} data-testid={`tab-admin-${k}`}>{l}</button>)}
      </div>
      <p className="mb-4 rounded-xl bg-white/5 p-3 text-xs text-muted-foreground">Utrulling av opptjening kan ikke aktiveres herfra. Den styres av drift etter at sikkerhets- og innloggingskontrollene er klarert.</p>
      {tab === 'create' && <CreateForm onDone={() => setTab('offers')} />}
      {tab === 'offers' && <AdminOffers />}
      {tab === 'conv' && <AdminConversions />}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const partners = useListV2OfferPartners({ query: { queryKey: getListV2OfferPartnersQueryKey() } });
  const inv = useInvalidate();
  const create = useCreateV2Offer();
  const empty = { partnerId: '', title: '', description: '', terms: '', points: '', destinationUrl: '', category: 'other' as V2OfferInput['category'], requirements: '', completionSteps: '', estimatedMinutes: '', approvalDays: '', expiresAt: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }));
  if (partners.isLoading) return <Skel className="h-60" />;
  if (partners.isError) return <ErrorState message={errMsg(partners.error)} onRetry={() => partners.refetch()} />;
  if (!partners.data || partners.data.length === 0) return <Empty icon={<Lock />} title="Ingen partnere er satt opp" text="Partnerkonfigurasjon opprettes av driftsteamet. Det finnes ikke noe API for å opprette partnere her, så et tilbud kan ikke lages før en partner er klargjort av operatør." />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const points = Number(f.points);
    let https = false;
    try { https = new URL(f.destinationUrl).protocol === 'https:'; } catch { https = false; }
    if (!f.partnerId) return setErr('Velg en partner.');
    if (f.title.trim().length < 3 || f.title.length > 120) return setErr('Tittel må være 3-120 tegn.');
    if (f.description.trim().length < 10 || f.description.length > 2000) return setErr('Beskrivelse må være 10-2000 tegn.');
    if (f.terms.trim().length < 10 || f.terms.length > 4000) return setErr('Vilkår må være 10-4000 tegn.');
    if (!Number.isInteger(points) || points < 1 || points > 1000000) return setErr('Poeng må være et heltall mellom 1 og 1 000 000.');
    if (!https || f.destinationUrl.length > 2000) return setErr('Destinasjon må være en HTTPS-adresse på maks 2000 tegn.');
    if (f.requirements.trim().length < 10 || f.completionSteps.trim().length < 10) return setErr('Krav og gjennomføring må være minst 10 tegn hver.');
    const estimatedMinutes = Number(f.estimatedMinutes), approvalDays = Number(f.approvalDays);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 10080 ||
      !Number.isInteger(approvalDays) || approvalDays < 1 || approvalDays > 365) return setErr('Oppgi tid i hele minutter (1–10080) og vurderingsdager (1–365).');
    if (f.expiresAt && new Date(f.expiresAt).getTime() <= Date.now()) return setErr('Utløpsdato må være i fremtiden.');
    setErr(null);
    create.mutate({ data: { partnerId: f.partnerId, title: f.title.trim(), description: f.description.trim(), terms: f.terms.trim(), points, destinationUrl: f.destinationUrl,
      category: f.category, requirements: f.requirements.trim(), completionSteps: f.completionSteps.trim(), estimatedMinutes, approvalDays,
      expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null } }, {
      onSuccess: () => { void inv.offers(); setF(empty); onDone(); },
      onError: x => setErr(errMsg(x)),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="rounded-xl bg-sky-400/10 p-3 text-sm text-sky-100">Utkastet er uforanderlig etter opprettelse. Det kan bare godkjennes eller avvises. Kontroller feltene nøye.</p>
      <L id="of-partner" t="Partner"><select id="of-partner" className={inputCls} value={f.partnerId} onChange={set('partnerId')} data-testid="select-partner"><option value="">Velg partner</option>{partners.data.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}</select></L>
      <L id="of-title" t="Tittel"><input id="of-title" className={inputCls} value={f.title} onChange={set('title')} maxLength={120} data-testid="input-offer-title" /></L>
      <L id="of-desc" t="Beskrivelse"><textarea id="of-desc" rows={3} className={inputCls} value={f.description} onChange={set('description')} maxLength={2000} data-testid="input-offer-description" /></L>
      <L id="of-terms" t="Vilkår"><textarea id="of-terms" rows={4} className={inputCls} value={f.terms} onChange={set('terms')} maxLength={4000} data-testid="input-offer-terms" /></L>
      <L id="of-points" t="Poeng"><input id="of-points" inputMode="numeric" className={inputCls} value={f.points} onChange={set('points')} data-testid="input-offer-points" /></L>
      <L id="of-url" t="Destinasjons-URL (HTTPS)"><input id="of-url" type="url" inputMode="url" className={inputCls} value={f.destinationUrl} onChange={set('destinationUrl')} maxLength={2000} data-testid="input-offer-url" /></L>
      <L id="of-category" t="Kategori"><select id="of-category" className={inputCls} value={f.category} onChange={e => setF(v => ({ ...v, category: e.target.value as V2OfferInput['category'] }))}>{Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></L>
      <L id="of-requirements" t="Krav"><textarea id="of-requirements" className={inputCls} value={f.requirements} onChange={set('requirements')} maxLength={2000} /></L>
      <L id="of-steps" t="Gjennomføring"><textarea id="of-steps" className={inputCls} value={f.completionSteps} onChange={set('completionSteps')} maxLength={2000} /></L>
      <L id="of-minutes" t="Beregnet tid (minutter)"><input id="of-minutes" inputMode="numeric" className={inputCls} value={f.estimatedMinutes} onChange={set('estimatedMinutes')} /></L>
      <L id="of-days" t="Forventet vurdering (dager)"><input id="of-days" inputMode="numeric" className={inputCls} value={f.approvalDays} onChange={set('approvalDays')} /></L>
      <L id="of-expiry" t="Utløpsdato (valgfritt, lokal tid)"><input id="of-expiry" type="datetime-local" className={inputCls} value={f.expiresAt} onChange={set('expiresAt')} /></L>
      <div aria-live="polite">{err && <p className="text-sm text-red-300" role="alert" data-testid="text-create-error">{err}</p>}</div>
      <Btn type="submit" loading={create.isPending} disabled={create.isPending} data-testid="button-create-offer">Opprett utkast</Btn>
    </form>
  );
}

function AdminOffers() {
  const q = useListV2AdminOffers({ query: { queryKey: getListV2AdminOffersQueryKey() } });
  const review = useReviewV2Offer();
  const approval = useApprovalRequest();
  const inv = useInvalidate();
  const [msg, setMsg] = useState<string | null>(null);
  const act = (o: V2Offer, status: 'approved' | 'rejected') => (reason: string) => {
    setMsg(null);
    if (status === 'approved') { approval.send('OFFER_APPROVAL', { offerId: o.id }, reason, { onQueued: r => setMsg(queuedText(r)), onError: x => setMsg(errMsg(x)) }); return; }
    review.mutate({ offerId: o.id, data: { status, reason } }, { onSuccess: () => { void inv.offers(o.id); setMsg('Tilbudet er avvist.'); }, onError: x => setMsg(errMsg(x)) });
  };
  const sorted = useMemo(() => q.data?.items ?? [], [q.data]);
  if (q.isLoading) return <Skel className="h-40" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return (
    <List limitNote="Viser de siste 100 tilbudene, alle statuser.">
      <div aria-live="polite" className="mb-2 text-sm" data-testid="text-offer-review-msg">{msg}</div>
      {sorted.length === 0 ? <Empty title="Ingen tilbud" text="Opprett et utkast under Nytt utkast." /> : (
        <ul className="space-y-3">{sorted.map(o => (
          <li key={o.id} className="rounded-2xl bg-white/5 p-4" data-testid={`row-admin-offer-${o.id}`}>
            <div className="flex items-start justify-between gap-2"><div><div className="text-xs text-muted-foreground">{o.partnerName} · {fmtDate(o.createdAt)}</div><div className="font-bold">{o.title}</div><div className="text-xs">{nf.format(o.points)} poeng</div></div><Chip k={o.status}>{OFFER[o.status]}</Chip></div>
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-primary">Kontroller krav, vilkår og destinasjon</summary><div className="mt-2 space-y-2 whitespace-pre-wrap break-words"><p>{o.description}</p><p><b>Krav:</b> {o.requirements}</p><p><b>Gjennomføring:</b> {o.completionSteps}</p><p><b>Vilkår:</b> {o.terms}</p><p><b>Destinasjon:</b> {o.destinationUrl}</p><p>{o.estimatedMinutes} minutter · ca. {o.approvalDays} vurderingsdager · {o.expiresAt ? `utløper ${fmtDate(o.expiresAt)}` : 'ingen fast utløpsdato'}</p></div></details>
            {o.status === 'draft' && <><ReasonBox testid={`approve-${o.id}`} label="Send til godkjenning" pending={review.isPending || approval.isPending} onSubmit={act(o, 'approved')} /><ReasonBox testid={`reject-draft-${o.id}`} label="Avvis utkast" danger pending={review.isPending} onSubmit={act(o, 'rejected')} /></>}
            {o.status === 'approved' && <ReasonBox testid={`pause-${o.id}`} label="Avvis og pause" danger pending={review.isPending} onSubmit={act(o, 'rejected')} />}
          </li>))}</ul>)}
    </List>
  );
}

function AdminConversions() {
  const q = useListV2AdminConversions({ query: { queryKey: getListV2AdminConversionsQueryKey(), refetchInterval: 30000 } });
  const review = useReviewV2Conversion();
  const inv = useInvalidate();
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(false);
  useEffect(() => { setNow(true); }, []);
  const act = (c: V2Conversion, status: 'verified' | 'rejected') => (reason: string) => {
    setMsg(null);
    review.mutate({ conversionId: c.id, data: { status, reason } }, { onSuccess: () => { void inv.conversions(); setMsg(status === 'verified' ? 'Konverteringen er verifisert.' : 'Konverteringen er avvist.'); }, onError: x => setMsg(errMsg(x)) });
  };
  if (q.isLoading) return <Skel className="h-40" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return (
    <List limitNote="Viser de siste 100 konverteringene. Oppdateres automatisk hvert 30. sekund.">
      <div aria-live="polite" className="mb-2 text-sm" data-testid="text-conv-review-msg">{now && msg}</div>
      {q.data!.items.length === 0 ? <Empty title="Ingen konverteringer" text="Konverteringer vises når brukere har startet tilbud og partnere har meldt tilbake." /> : (
        <ul className="space-y-3">{q.data!.items.map(c => (
          <li key={c.id} className="rounded-2xl bg-white/5 p-4" data-testid={`row-admin-conversion-${c.id}`}>
            <div className="flex items-start justify-between gap-2"><div><div className="font-bold">{c.offerTitle}</div><div className="text-xs text-muted-foreground">{fmtDate(c.createdAt)} · {nf.format(c.points)} poeng</div><div className="mt-1 text-xs text-muted-foreground">{PARTNER[c.partnerStatus]}</div></div><Chip k={c.status}>{CONV[c.status]}</Chip></div>
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Kontroller mottaker og partnerreferanser</summary><p className="mt-2 break-all">Konto: {c.accountId}<br />Partner: {c.partnerId}<br />Hendelse: {c.eventId}<br />Klikk: {c.clickId}<br />Poengtransaksjon: {c.transactionId}</p></details>
            <ReversalHistory conversion={c} admin />
            {c.status === 'verified' && <ReverseConversionForm conversion={c} onDone={() => {
              void inv.conversions(); setMsg(`Konverteringen er tilbakeført. ${nf.format(c.points)} poeng er trukket tilbake.`);
            }} />}
            {c.status === 'pending' && <>
              {c.partnerStatus !== 'verified' && <p className="mt-2 text-xs text-amber-200">Verifisering er låst til partneren har bekreftet via signert callback. En bekreftelse fra partner krever fortsatt manuell vurdering.</p>}
              <ReasonBox testid={`verify-${c.id}`} label="Verifiser" pending={review.isPending} disabled={c.partnerStatus !== 'verified'} onSubmit={act(c, 'verified')} />
              <ReasonBox testid={`reject-conv-${c.id}`} label="Avvis" danger pending={review.isPending} onSubmit={act(c, 'rejected')} />
            </>}
          </li>))}</ul>)}
    </List>
  );
}
