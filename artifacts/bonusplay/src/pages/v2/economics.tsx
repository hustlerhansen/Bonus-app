import { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { usePreviewV2CampaignEconomics, type V2CampaignEconomics, type V2CampaignEconomicsInput } from '@workspace/api-client-react';
import { Btn } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { cn } from '@/lib/utils';

const nf = new Intl.NumberFormat('nb-NO');
const kr = (ore: number) => `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ore / 100)} kr`;
const pct = (bp: number) => `${(bp / 100).toLocaleString('nb-NO')} %`;
const inputCls = 'mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/40 sm:text-sm';

export const emptyEconomics = { cpa: '', networkFee: '15', reversal: '10', giftcardFee: '2', share: '', maxConversions: '', paymentTerms: '30', agreement: '' };
export type EconomicsForm = typeof emptyEconomics;

const num = (s: string) => Number(s.replace(',', '.'));
/** Form values (kr and %) to API values (øre and basis points). Returns an error message for invalid input. */
export function toEconomicsInput(f: EconomicsForm): V2CampaignEconomicsInput | string {
  const cpa = num(f.cpa), fee = num(f.networkFee), rev = num(f.reversal), gc = num(f.giftcardFee), max = num(f.maxConversions), terms = num(f.paymentTerms);
  if (!(cpa >= 1 && cpa <= 1_000_000)) return 'Oppgi partnerens betaling per konvertering i kroner (minst 1 kr).';
  if (![fee, rev].every(v => v >= 0 && v <= 90) || !(gc >= 0 && gc <= 20)) return 'Gebyrer og tilbakeføring må være prosenter (gavekortgebyr maks 20 %).';
  if (f.share.trim() && !(num(f.share) > 0 && num(f.share) <= 40)) return 'Brukerandelen kan ikke overstige 40 %.';
  if (!Number.isInteger(max) || max < 1) return 'Oppgi maks antall konverteringer.';
  if (!Number.isInteger(terms) || terms < 0 || terms > 365) return 'Betalingsfrist må være 0–365 dager.';
  if (f.agreement.trim().length < 10) return 'Oppgi avtalereferanse (minst 10 tegn).';
  return {
    grossCpaOre: Math.round(cpa * 100), networkFeeBp: Math.round(fee * 100), expectedReversalBp: Math.round(rev * 100),
    giftcardFeeBp: Math.round(gc * 100), ...(f.share.trim() ? { userShareBp: Math.round(num(f.share) * 100) } : {}),
    maxConversions: max, paymentTermsDays: terms, agreementReference: f.agreement.trim(),
  };
}

export function EconomicsSummary({ e }: { e: V2CampaignEconomics }) {
  const rows: [string, string][] = [
    ['Netto partnerinntekt per konvertering', kr(e.netOre)],
    ['Brukerandel', pct(e.userShareBp)],
    ['Poeng til brukeren', `${nf.format(e.points)} BP (${kr(e.points)})`],
    ['Forventet bidrag per konvertering', kr(e.marginOre)],
    ['Forventet margin', pct(e.expectedMarginBp)],
    ['Maks poenggjeld for kampanjen', kr(e.maxLiabilityOre)],
  ];
  return (
    <div className={cn('rounded-2xl p-4 text-sm', e.ok ? 'bg-emerald-400/10' : 'bg-red-400/10')} data-testid="panel-economics">
      <div className="mb-2 flex items-center gap-2 font-bold">{e.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-red-300" />}
        {e.ok ? 'Lønnsom innenfor økonomireglene' : 'Oppfyller ikke økonomireglene'}</div>
      <dl className="grid gap-1 sm:grid-cols-2">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}</dl>
      {e.problems.length > 0 && <ul className="mt-2 list-disc pl-5 text-red-200">{e.problems.map(p => <li key={p}>{p}</li>)}</ul>}
      <p className="mt-2 text-[11px] text-muted-foreground">Beregnet med økonomiregler versjon {e.configVersion}. Poengene settes av serveren og kan ikke skrives inn manuelt.</p>
    </div>
  );
}

/** Campaign economics inputs with a server-side profitability calculation. */
export function EconomicsFields({ f, setF, onComputed }: { f: EconomicsForm; setF: (f: EconomicsForm) => void; onComputed: (ok: boolean) => void }) {
  const preview = usePreviewV2CampaignEconomics();
  const [result, setResult] = useState<V2CampaignEconomics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const field = (k: keyof EconomicsForm, label: string, hint?: string, mode: 'decimal' | 'numeric' | 'text' = 'decimal') => (
    <label className="block text-sm font-bold">{label}
      <input className={inputCls} inputMode={mode === 'text' ? undefined : mode} value={f[k]} placeholder={hint}
        onChange={e => { setF({ ...f, [k]: e.target.value }); setResult(null); onComputed(false); }} data-testid={`input-econ-${k}`} />
    </label>
  );
  const run = () => {
    const input = toEconomicsInput(f);
    if (typeof input === 'string') { setErr(input); return; }
    setErr(null);
    preview.mutate({ data: input }, { onSuccess: r => { setResult(r); onComputed(r.ok); }, onError: x => setErr(errMsg(x)) });
  };
  return (
    <fieldset className="space-y-3 rounded-2xl border border-white/10 p-4">
      <legend className="px-1 text-sm font-bold">Kampanjeøkonomi</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('cpa', 'Partnerens betaling per konvertering (kr)', 'f.eks. 200')}
        {field('networkFee', 'Nettverksgebyr (%)')}
        {field('reversal', 'Forventet andel tilbakeførte (%)')}
        {field('giftcardFee', 'Gavekortgebyr (%)')}
        {field('share', 'Brukerandel (%) — tom = standard 30 %', '30')}
        {field('maxConversions', 'Maks antall konverteringer', 'f.eks. 500', 'numeric')}
        {field('paymentTerms', 'Partnerens betalingsfrist (dager)', undefined, 'numeric')}
        {field('agreement', 'Avtalereferanse', 'Avtale-ID eller dokumentreferanse', 'text')}
      </div>
      <Btn size="sm" variant="ghost" onClick={run} loading={preview.isPending} data-testid="button-econ-preview">Beregn lønnsomhet</Btn>
      {err && <p className="text-sm text-red-300" role="alert">{err}</p>}
      {result && <EconomicsSummary e={result} />}
    </fieldset>
  );
}
