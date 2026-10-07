import { useState } from 'react';
import { Check, Copy, Share2, UserPlus, Users } from 'lucide-react';
import { Btn, Card, FeatureOff, PageHead } from '@/components/bp';
import { ClaimButton } from '@/components/claim-button';
import { useTrack } from '@/hooks/use-track';
import { isFlagOn, useBpState } from '@/hooks/use-bp';
import { useToast } from '@/hooks/use-toast';

export default function ReferralsPage() {
  const s = useBpState();
  const { toast } = useToast();
  const track = useTrack();
  const [copied, setCopied] = useState(false);
  const on = isFlagOn(s, 'REFERRALS');
  const code = 'BONUS-MAGNAR7';
  const act = s.user.activeReferrals;
  const link = `${window.location.origin}${import.meta.env.BASE_URL}?ref=${code}`;

  const copy = async () => {
    if (!navigator.clipboard?.writeText) { toast({ title: 'Kopiering støttes ikke', description: 'Nettleseren din tillater ikke kopiering. Marker og kopier lenken manuelt.', variant: 'destructive' }); return; }
    try { await navigator.clipboard.writeText(link); setCopied(true); track('referral_shared', 'copy'); setTimeout(() => setCopied(false), 1800); toast({ title: 'Lenke kopiert' }); }
    catch { toast({ title: 'Kunne ikke kopiere', description: 'Marker og kopier lenken manuelt.', variant: 'destructive' }); }
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'BONUSPLAY (demo)', text: 'Prøv BONUSPLAY-demoen.', url: link }); track('referral_shared', 'share'); } catch (e) { if ((e as Error)?.name !== 'AbortError') toast({ title: 'Kunne ikke dele', description: 'Prøv å kopiere lenken i stedet.', variant: 'destructive' }); } }
    else { toast({ title: 'Deling støttes ikke', description: 'Nettleseren din har ikke deling. Prøver å kopiere lenken i stedet.' }); copy(); }
  };
  return (
    <>
      <PageHead eyebrow="Venner" title="Verv venner" sub="Del lenken din. Når en venn blir aktiv, får du bonus (demo)." />
      {!on && <div className="mb-4"><FeatureOff name="Verving" /></div>}
      <Card glow className="mb-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Din vervekode</div>
        <div className="font-display gold-text mt-1 text-3xl" data-testid="text-ref-code">{code}</div>
        <div className="mt-3 break-all rounded-2xl bg-black/25 p-3 text-xs text-muted-foreground" data-testid="text-ref-link">{link}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="electric" disabled={!on} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy} data-testid="button-copy-ref">{copied ? 'Kopiert' : 'Kopier lenke'}</Btn>
          <Btn variant="ghost" disabled={!on} icon={<Share2 className="h-4 w-4" />} onClick={share} data-testid="button-share-ref">Del</Btn>
        </div>
      </Card>
      <Card className="mb-3 text-sm" data-testid="text-ref-info"><p>Vennen din får <b className="gold-text">250 poeng</b> og du får <b className="gold-text">500 poeng</b> når vennen fullfører sin første aktivitet (demo).</p></Card>
      <div className="mb-3 grid grid-cols-3 gap-3">{[['Inviterte', act + 1], ['Aktive', act], ['Opptjent', `${(act * 500).toLocaleString('nb-NO')}`]].map(([l, v]) => <Card key={l as string} className="p-4 text-center"><div className="font-display text-2xl tabular-nums" data-testid={`text-ref-${l}`}>{v}</div><div className="text-xs text-muted-foreground">{l}</div></Card>)}</div>
      <p className="mb-3 text-[11px] text-muted-foreground">Demoaggregat: inviterte = aktive + 1, opptjent = aktive × 500 poeng. Ingen ekte venner eller kontoer.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-4"><Users className="h-8 w-8 text-primary" /><div><div className="font-display text-3xl tabular-nums" data-testid="text-active-refs">{s.user.activeReferrals}</div><div className="text-xs text-muted-foreground">aktive vervinger</div></div></Card>
        <Card><div className="flex items-center gap-2 font-semibold"><UserPlus className="h-5 w-5 text-accent" />Simuler at en venn blir aktiv</div>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">Demo: representerer en venn som fullfører sin første aktivitet. Deling og kopiering gir ingen belønning.</p>
          <ClaimButton activityId="referral-active" label="Aktiver demovenn" disabled={!on} variant="electric" icon={<UserPlus className="h-4 w-4" />} /></Card>
      </div>
    </>
  );
}
