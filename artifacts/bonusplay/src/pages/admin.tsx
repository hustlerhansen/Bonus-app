import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Save, ShieldAlert, Sliders } from 'lucide-react';
import {
  getGetAdminCatalogQueryKey, getGetAdminDashboardQueryKey, getGetBonusplayStateQueryKey, useEndDemoSession, useGetAdminCatalog, useGetAdminDashboard,
  useStartDemoSession, useUpdateFeatureFlag, useUpdateMission, type AdminDashboard, type Mission,
} from '@workspace/api-client-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Btn, Card, Empty, ErrorState, PageHead, PageSkeleton, Pts } from '@/components/bp';
import { CatalogSection, type Cat } from '@/components/admin/catalog-section';
import { errMsg, useBpState, type FeatureKey } from '@/hooks/use-bp';
import { useToast } from '@/hooks/use-toast';
import { fmt, fmtDate } from '@/lib/format';

const flagLabel: Record<string, string> = { ADS: 'Annonser', SURVEYS: 'Undersøkelser', OFFERS: 'Tilbud', GAMES: 'Spill', EVENTS: 'Arrangementer', LEADERBOARDS: 'Topplister', REFERRALS: 'Verving', REDEMPTIONS: 'Innløsning', CHESTS: 'Kister' };
const SECTIONS = ['Oversikt', 'Brukere', 'Oppgaver', 'Spill', 'Undersøkelser', 'Tilbud', 'Arrangementer', 'Resultatliste', 'Belønninger', 'Bestillinger', 'Venner', 'Risiko', 'Analyse', 'Innstillinger', 'Økonomi'] as const;
type Section = (typeof SECTIONS)[number];
const catOf: Partial<Record<Section, [Cat, string]>> = { Oppgaver: ['mission', 'Oppgavekatalog'], Undersøkelser: ['survey', 'Undersøkelser'], Tilbud: ['offer', 'Tilbud'], Arrangementer: ['event', 'Arrangementer'], Belønninger: ['reward', 'Belønninger'] };
const nok = (n: number) => `${n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <Empty title={empty} />;
  return (
    <Card className="overflow-x-auto p-2"><table className="w-full min-w-[34rem] text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-white/5" data-testid={`row-admin-${i}`}>{r.map((c, j) => <td key={j} className="px-3 py-2.5 tabular-nums">{c}</td>)}</tr>)}</tbody></table></Card>
  );
}

export default function AdminPage() {
  const s = useBpState();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = s.user.role === 'admin';
  const [sec, setSec] = useState<Section>('Oversikt');
  const dash = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey(), enabled: isAdmin, retry: false } });
  const cat = useGetAdminCatalog({ query: { queryKey: getGetAdminCatalogQueryKey(), enabled: isAdmin, retry: false } });
  const flag = useUpdateFeatureFlag();
  const end = useEndDemoSession();
  const start = useStartDemoSession();

  const refresh = () => { qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); qc.invalidateQueries({ queryKey: getGetBonusplayStateQueryKey() }); qc.invalidateQueries({ queryKey: getGetAdminCatalogQueryKey() }); };
  const toggle = (key: string, enabled: boolean) => flag.mutate({ key: key as FeatureKey, data: { enabled } }, { onSuccess: () => { refresh(); toast({ title: `${flagLabel[key] ?? key} ${enabled ? 'aktivert' : 'deaktivert'}` }); }, onError: (e) => toast({ title: 'Kunne ikke oppdatere', description: errMsg(e), variant: 'destructive' }) });
  const switchToAdmin = async () => { try { await end.mutateAsync(); await start.mutateAsync({ data: { role: 'admin' } }); qc.clear(); window.location.reload(); } catch (e) { toast({ title: 'Innlogging feilet', description: errMsg(e), variant: 'destructive' }); } };

  if (!isAdmin) {
    return (<>
      <PageHead eyebrow="Admin" title="Ingen tilgang" />
      <Card className="text-center"><ShieldAlert className="mx-auto h-10 w-10 text-amber-300" /><p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">Admin krever en administratorøkt. Du kan eksplisitt logge inn som admin i demo-modus.</p>
        <Btn className="mt-4" variant="gold" loading={end.isPending || start.isPending} onClick={switchToAdmin} data-testid="button-switch-admin">Bytt til admin-demo</Btn></Card></>);
  }
  if (dash.isLoading) return <PageSkeleton />;
  if (dash.isError || !dash.data) return <ErrorState message={errMsg(dash.error)} onRetry={() => dash.refetch()} />;
  const d: AdminDashboard = dash.data;
  const econ = d.metrics.filter((m) => /arpu|arpdau|belønning|ansvar|forpliktelse|inntekt|bidrag|økonomi|poengverdi|kostnad|margin/i.test(m.label));
  const sum = (k: 'grossRevenueNok' | 'providerCostNok' | 'rewardCostNok' | 'contributionNok') => d.revenueEvents.reduce((a, r) => a + r[k], 0);
  const Metrics = ({ list }: { list: typeof d.metrics }) => (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{list.map((m) => (
      <Card key={m.label} className="p-4" data-testid={`metric-${m.label}`}><Activity className="h-4 w-4 text-primary" /><div className="font-display gold-text mt-2 text-2xl tabular-nums">{m.value}</div><div className="text-xs text-muted-foreground">{m.label}</div></Card>))}</div>);
  const demo = <p className="mb-4 rounded-xl border border-amber-300/25 bg-amber-400/10 p-3 text-xs text-amber-100">Alle pengebeløp er demo-tall og representerer ikke ekte inntekter, kostnader eller utbetalinger.</p>;
  const c = catOf[sec];

  return (
    <>
      <PageHead eyebrow="Admin (demo)" title="Kontrollrom" sub="Demometrikker, kataloger og konfigurasjon. Endringer gjelder alle brukere." />
      <div className="-mx-4 mb-6 overflow-x-auto px-4"><div className="flex w-max gap-1.5" role="tablist">{SECTIONS.map((x) => (
        <button key={x} role="tab" aria-selected={sec === x} onClick={() => setSec(x)} data-testid={`tab-admin-${x}`} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${sec === x ? 'btn-electric border-transparent' : 'border-white/15 bg-white/5 text-muted-foreground'}`}>{x}</button>))}</div></div>

      {sec === 'Oversikt' && <div className="space-y-4">{demo}<Metrics list={d.metrics} /></div>}
      {sec === 'Brukere' && <Table empty="Ingen brukere ennå" head={['Navn', 'Nivå', 'Totalt tjent', 'Aktive vervinger', 'Opprettet']} rows={d.users.map((u) => [u.displayName, u.level, fmt(u.totalPointsEarned), u.activeReferrals, fmtDate(u.createdAt)])} />}
      {c && (cat.isLoading ? <PageSkeleton /> : cat.isError || !cat.data ? <ErrorState message={errMsg(cat.error)} onRetry={() => cat.refetch()} /> : (
        <div className="space-y-8">
          <CatalogSection cat={c[0]} items={cat.data} title={c[1]} />
          {sec === 'Arrangementer' && (<div><h2 className="font-display mb-3 text-lg">Aktive arrangementer (tilstand)</h2><Table empty="Ingen arrangementer" head={['Tittel', 'Juveler', 'Mål', 'Gjenstår (sek)']} rows={s.events.map((e) => [e.title, fmt(e.gems), fmt(e.target), fmt(e.secondsRemaining)])} /></div>)}
          {sec === 'Oppgaver' && (<div><h2 className="font-display mb-3 text-lg">Hurtigredigering av eksisterende oppdrag</h2><div className="space-y-2">{d.missions.map((m) => <MissionRow key={`${m.id}-${m.points}-${m.xp}-${m.enabled}`} m={m} onSaved={refresh} />)}</div></div>)}
        </div>))}
      {sec === 'Spill' && (<div className="space-y-3"><p className="text-sm text-muted-foreground">Skrivebeskyttet oversikt over demospillene.</p>
        <Table empty="" head={['Spill', 'Aktivitets-ID', 'Status']} rows={[['10 sek tap', 'game-tap'], ['Reaksjonstest', 'game-reaction'], ['Memory', 'game-memory']].map(([n, id]) => [n, id, s.featureFlags.find((f) => f.key === 'GAMES')?.enabled === false ? 'Avslått' : 'Aktiv'])} /></div>)}
      {sec === 'Resultatliste' && (<div className="space-y-4">{(['day', 'week', 'month'] as const).map((k) => (<div key={k}><h2 className="font-display mb-2 text-base">{k === 'day' ? 'I dag' : k === 'week' ? 'Denne uken' : 'Denne måneden'}</h2>
        <Table empty="Ingen oppføringer" head={['Plass', 'Navn', 'Poeng']} rows={s.leaderboards[k].map((r) => [r.rank, r.name, fmt(r.points)])} /></div>))}</div>)}
      {sec === 'Bestillinger' && <div className="space-y-3">{demo}<Table empty="Ingen bestillinger ennå" head={['Belønning', 'Verdi (demo)', 'Poeng', 'Status', 'Opprettet']} rows={d.redemptions.map((r) => [r.rewardTitle, nok(r.nokAmount), fmt(r.points), r.status === 'PENDING' ? 'Venter' : 'Manuell vurdering', fmtDate(r.createdAt)])} /></div>}
      {sec === 'Venner' && (<div className="space-y-3"><p className="text-sm text-muted-foreground">Skrivebeskyttet: aktive vervinger per bruker.</p>
        <Table empty="Ingen brukere ennå" head={['Bruker', 'Aktive vervinger']} rows={[...d.users].sort((a, b) => b.activeReferrals - a.activeReferrals).map((u) => [u.displayName, u.activeReferrals])} /></div>)}
      {sec === 'Risiko' && <Table empty="Ingen risikohendelser registrert" head={['Bruker-ID', 'Årsak', 'Risikoscore', 'Tidspunkt']} rows={d.fraudEvents.map((f) => [f.userId, f.reason, f.riskScore, fmtDate(f.createdAt)])} />}
      {sec === 'Analyse' && (<div className="space-y-4"><Metrics list={d.metrics} /><h2 className="font-display text-lg">Revisjonslogg</h2>
        <Table empty="Ingen loggførte handlinger" head={['Aktør', 'Handling', 'Kilde', 'Tidspunkt']} rows={d.auditLogs.map((l) => [l.actor, l.action, l.sourceId ?? '-', fmtDate(l.createdAt)])} /></div>)}
      {sec === 'Innstillinger' && (<div className="space-y-3"><p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground"><Sliders className="mr-1 inline h-3.5 w-3.5" />Demo, global konfigurasjon: brytere påvirker alle brukere.</p>
        <div className="grid gap-2 sm:grid-cols-2">{d.featureFlags.map((f) => (<Card key={f.key} className="flex items-center justify-between p-4"><div><div className="font-semibold">{flagLabel[f.key] ?? f.key}</div><div className="text-xs text-muted-foreground">{f.key}</div></div>
          <Switch checked={f.enabled} disabled={flag.isPending} onCheckedChange={(v) => toggle(f.key, v)} data-testid={`switch-flag-${f.key}`} /></Card>))}</div></div>)}
      {sec === 'Økonomi' && (<div className="space-y-4">{demo}{econ.length > 0 && <Metrics list={econ} />}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Brutto (demo)', sum('grossRevenueNok')], ['Leverandørkost (demo)', sum('providerCostNok')], ['Belønningskost (demo)', sum('rewardCostNok')], ['Bidrag (demo)', sum('contributionNok')]].map(([l, v]) => (
          <Card key={l as string} className="p-4"><div className="font-display text-xl tabular-nums">{nok(v as number)}</div><div className="text-xs text-muted-foreground">{l as string}</div></Card>))}</div>
        <Table empty="Ingen inntektshendelser" head={['Kilde', 'Brutto', 'Leverandør', 'Belønning', 'Bidrag', 'Tidspunkt']} rows={d.revenueEvents.map((r) => [r.sourceId, nok(r.grossRevenueNok), nok(r.providerCostNok), nok(r.rewardCostNok), nok(r.contributionNok), fmtDate(r.createdAt)])} /></div>)}
    </>
  );
}

function MissionRow({ m, onSaved }: { m: Mission; onSaved: () => void }) {
  const { toast } = useToast();
  const upd = useUpdateMission();
  const [enabled, setEnabled] = useState(m.enabled);
  const [points, setPoints] = useState(String(m.points));
  const [xp, setXp] = useState(String(m.xp));
  const pn = Number(points), xn = Number(xp);
  const valid = Number.isInteger(pn) && Number.isInteger(xn) && pn >= 0 && pn <= 10000 && xn >= 0 && xn <= 10000;
  const dirty = enabled !== m.enabled || pn !== m.points || xn !== m.xp;
  const save = () => upd.mutate({ id: m.id, data: { enabled, points: pn, xp: xn } }, { onSuccess: () => { onSaved(); toast({ title: 'Oppdrag lagret', description: m.title }); }, onError: (e) => toast({ title: 'Kunne ikke lagre', description: errMsg(e), variant: 'destructive' }) });
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4" data-testid={`row-admin-mission-${m.id}`}>
      <div className="min-w-[10rem] flex-1"><div className="font-semibold">{m.title}</div><div className="text-xs text-muted-foreground">{m.id}</div></div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">Aktiv<Switch checked={enabled} onCheckedChange={setEnabled} data-testid={`switch-mission-${m.id}`} /></label>
      <label className="text-xs text-muted-foreground">Poeng<Input type="number" min={0} max={10000} value={points} onChange={(e) => setPoints(e.target.value)} className="mt-1 h-10 w-24 rounded-xl" data-testid={`input-points-${m.id}`} /></label>
      <label className="text-xs text-muted-foreground">Erfaring<Input type="number" min={0} max={10000} value={xp} onChange={(e) => setXp(e.target.value)} className="mt-1 h-10 w-24 rounded-xl" data-testid={`input-xp-${m.id}`} /></label>
      <Btn size="sm" variant="electric" icon={<Save className="h-4 w-4" />} loading={upd.isPending} disabled={!dirty || !valid} onClick={save} data-testid={`button-save-${m.id}`}>Lagre</Btn>
    </Card>
  );
}
