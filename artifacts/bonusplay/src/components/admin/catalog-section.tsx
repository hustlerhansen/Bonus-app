import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import {
  CatalogInputType, getGetAdminCatalogQueryKey, getGetAdminDashboardQueryKey, getGetBonusplayStateQueryKey, useCreateCatalogItem, useUpdateCatalogItem,
  type CatalogInput, type CatalogItem, type CatalogUpdate,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Btn, Card, Empty, Pts } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { useToast } from '@/hooks/use-toast';
import { fmt, fmtDate } from '@/lib/format';

export type Cat = 'mission' | 'survey' | 'offer' | 'event' | 'reward';
type Num = { k: 'points' | 'xp' | 'gems' | 'minutes' | 'cost' | 'nokAmount' | 'target'; l: string; min: number; max: number; req?: boolean };
const NUM: Record<Cat, Num[]> = {
  mission: [{ k: 'points', l: 'Poeng', min: 0, max: 10000 }, { k: 'xp', l: 'Erfaring', min: 0, max: 1000 }],
  survey: [{ k: 'minutes', l: 'Minutter', min: 0, max: 60 }, { k: 'points', l: 'Poeng', min: 0, max: 10000 }, { k: 'xp', l: 'Erfaring', min: 0, max: 1000 }],
  offer: [{ k: 'points', l: 'Poeng', min: 0, max: 10000 }, { k: 'xp', l: 'Erfaring', min: 0, max: 1000 }],
  event: [{ k: 'target', l: 'Mål (juveler)', min: 1, max: 10000, req: true }, { k: 'gems', l: 'Startjuveler', min: 0, max: 100 }],
  reward: [{ k: 'cost', l: 'Pris (poeng)', min: 1, max: 1000000, req: true }, { k: 'nokAmount', l: 'Verdi (NOK, demo)', min: 1, max: 10000, req: true }],
};
const TYPE_L: Record<string, string> = { WATCH_AD: 'Annonse', PLAY_GAME: 'Spill', SURVEY: 'Undersøkelse', OFFER: 'Tilbud', DAILY_CHALLENGE: 'Daglig utfordring', REFERRAL: 'Verving', STREAK: 'Dagsrekke' };
export const CAT_L: Record<Cat, string> = { mission: 'oppgave', survey: 'undersøkelse', offer: 'tilbud', event: 'arrangement', reward: 'belønning' };

const toLocal = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function ItemForm({ cat, item, onClose }: { cat: Cat; item?: CatalogItem; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateCatalogItem();
  const update = useUpdateCatalogItem();
  const [title, setTitle] = useState(item?.title ?? '');
  const [desc, setDesc] = useState(item?.description ?? '');
  const [enabled, setEnabled] = useState(item?.enabled ?? true);
  const [type, setType] = useState<string>(item?.type ?? 'DAILY_CHALLENGE');
  const [nums, setNums] = useState<Record<string, string>>(() => Object.fromEntries(NUM[cat].map((n) => [n.k, item?.[n.k] !== undefined ? String(item[n.k]) : ''])));
  const [rcat, setRcat] = useState(item?.rewardCategory ?? '');
  const [ends, setEnds] = useState(toLocal(item?.endsAt));
  const [err, setErr] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;

  const submit = () => {
    if (!title.trim()) return setErr('Tittel må fylles ut.');
    const body: Record<string, unknown> = { title: title.trim(), description: desc.trim(), enabled };
    for (const n of NUM[cat]) {
      const raw = nums[n.k]?.trim();
      if (!raw) { if (n.req) return setErr(`${n.l} må fylles ut.`); continue; }
      const v = Number(raw);
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < n.min || v > n.max) return setErr(`${n.l} må være et heltall mellom ${fmt(n.min)} og ${fmt(n.max)}.`);
      body[n.k] = v;
    }
    if (cat === 'mission') body.type = type;
    if (cat === 'reward' && rcat.trim()) body.rewardCategory = rcat.trim();
    if (cat === 'event' && ends) { const d = new Date(ends); if (Number.isNaN(d.getTime())) return setErr('Ugyldig sluttdato.'); body.endsAt = d.toISOString(); }
    if (cat === 'event' && !ends && !item) return setErr('Sluttdato må fylles ut.');
    setErr(null);
    const done = () => {
      qc.invalidateQueries({ queryKey: getGetBonusplayStateQueryKey() });
      qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
      qc.invalidateQueries({ queryKey: getGetAdminCatalogQueryKey() });
      toast({ title: item ? 'Endringer lagret' : 'Opprettet', description: title });
      onClose();
    };
    const fail = (e: unknown) => setErr(errMsg(e));
    if (item) update.mutate({ id: item.id, data: body as CatalogUpdate }, { onSuccess: done, onError: fail });
    else create.mutate({ data: { ...body, category: cat } as CatalogInput }, { onSuccess: done, onError: fail });
  };

  const field = 'mt-1 h-11 rounded-xl';
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="glass max-h-[90dvh] max-w-md overflow-y-auto rounded-[2rem] border-white/10" data-testid={`dialog-catalog-${cat}`}>
        <DialogTitle className="font-display text-xl">{item ? 'Rediger' : 'Ny'} {CAT_L[cat]}</DialogTitle>
        <DialogDescription>Demo-innhold. Endringer gjelder for alle brukere.</DialogDescription>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">Tittel<Input className={field} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-catalog-title" /></label>
          <label className="block text-xs text-muted-foreground">Beskrivelse<Input className={field} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} data-testid="input-catalog-description" /></label>
          {cat === 'mission' && (
            <label className="block text-xs text-muted-foreground">Type
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" data-testid="select-catalog-type">
                {Object.values(CatalogInputType).map((t) => <option key={t} value={t}>{TYPE_L[t]}</option>)}</select></label>)}
          <div className="grid grid-cols-2 gap-3">{NUM[cat].map((n) => (
            <label key={n.k} className="block text-xs text-muted-foreground">{n.l}{n.req ? ' *' : ''}<Input type="number" inputMode="numeric" min={n.min} max={n.max} className={field} value={nums[n.k]} onChange={(e) => setNums((x) => ({ ...x, [n.k]: e.target.value }))} data-testid={`input-catalog-${n.k}`} /></label>))}</div>
          {cat === 'reward' && <label className="block text-xs text-muted-foreground">Kategori<Input className={field} maxLength={50} value={rcat} onChange={(e) => setRcat(e.target.value)} data-testid="input-catalog-rewardCategory" /></label>}
          {cat === 'event' && <label className="block text-xs text-muted-foreground">Slutter *<Input type="datetime-local" className={field} value={ends} onChange={(e) => setEnds(e.target.value)} data-testid="input-catalog-endsAt" /></label>}
          <label className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-sm">Aktiv<Switch checked={enabled} onCheckedChange={setEnabled} data-testid="switch-catalog-enabled" /></label>
        </div>
        {err && <p role="alert" className="rounded-xl bg-destructive/15 p-3 text-sm text-rose-200" data-testid="text-catalog-error">{err}</p>}
        <div className="flex gap-2"><Btn variant="ghost" className="flex-1" disabled={pending} onClick={onClose} data-testid="button-catalog-cancel">Avbryt</Btn>
          <Btn variant="gold" className="flex-1" loading={pending} onClick={submit} data-testid="button-catalog-save">{item ? 'Lagre' : 'Opprett'}</Btn></div>
      </DialogContent>
    </Dialog>
  );
}

export function CatalogSection({ cat, items, title }: { cat: Cat; items: CatalogItem[]; title: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateCatalogItem();
  const [form, setForm] = useState<{ item?: CatalogItem } | null>(null);
  const rows = useMemo(() => items.filter((i) => i.category === cat), [items, cat]);
  const toggle = (i: CatalogItem, enabled: boolean) => update.mutate({ id: i.id, data: { enabled } }, {
    onSuccess: () => { [getGetBonusplayStateQueryKey(), getGetAdminDashboardQueryKey(), getGetAdminCatalogQueryKey()].forEach((k) => qc.invalidateQueries({ queryKey: k })); toast({ title: enabled ? 'Aktivert' : 'Deaktivert', description: i.title }); },
    onError: (e) => toast({ title: 'Kunne ikke oppdatere', description: errMsg(e), variant: 'destructive' }),
  });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-display text-lg">{title}</h2>
        <Btn size="sm" variant="electric" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({})} data-testid={`button-new-${cat}`}>Ny {CAT_L[cat]}</Btn></div>
      {rows.length === 0 ? <Empty title={`Ingen ${CAT_L[cat]}er i katalogen`} text="Opprett den første med knappen over." /> : (
        <div className="space-y-2">{rows.map((i) => (
          <Card key={i.id} className="flex flex-wrap items-center gap-3 p-4" data-testid={`row-catalog-${i.id}`}>
            <div className="min-w-[10rem] flex-1"><div className="font-semibold">{i.title}</div><div className="line-clamp-1 text-xs text-muted-foreground">{i.description}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.type && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px]">{TYPE_L[i.type] ?? i.type}</span>}
                {i.points !== undefined && <Pts value={i.points} />}{i.xp !== undefined && <Pts value={i.xp} kind="xp" />}{i.gems !== undefined && <Pts value={i.gems} kind="gems" />}
                {i.minutes !== undefined && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px]">{i.minutes} min</span>}
                {i.cost !== undefined && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px]">{fmt(i.cost)} poeng</span>}
                {i.nokAmount !== undefined && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px]">{fmt(i.nokAmount)} kr (demo)</span>}
                {i.target !== undefined && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px]">Mål {fmt(i.target)}</span>}
                {i.endsAt && <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px]">Slutter {fmtDate(i.endsAt)}</span>}</div></div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Aktiv<Switch checked={i.enabled} disabled={update.isPending} onCheckedChange={(v) => toggle(i, v)} data-testid={`switch-catalog-${i.id}`} /></label>
            <Btn size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ item: i })} data-testid={`button-edit-${i.id}`}>Rediger</Btn>
          </Card>))}</div>)}
      {form && <ItemForm key={form.item?.id ?? 'new'} cat={cat} item={form.item} onClose={() => setForm(null)} />}
    </div>
  );
}
