import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Bell, Download, FileText, HelpCircle, LogOut, RotateCcw, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { getGetBonusplayStateQueryKey, useEndDemoSession, useResetDemo } from '@workspace/api-client-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Btn, Card, PageHead } from '@/components/bp';
import { errMsg, useBpState } from '@/hooks/use-bp';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const s = useBpState();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, nav] = useLocation();
  const reset = useResetDemo();
  const logout = useEndDemoSession();
  const [confirmReset, setConfirmReset] = useState(false);
  const [push, setPush] = useState(() => localStorage.getItem('bp-push') !== 'off');
  const [deferred, setDeferred] = useState<(Event & { prompt?: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setDeferred(e as Event & { prompt?: () => Promise<void> }); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  const doReset = () => reset.mutate(undefined, {
    onSuccess: (st) => { qc.setQueryData(getGetBonusplayStateQueryKey(), st); qc.invalidateQueries({ queryKey: getGetBonusplayStateQueryKey() }); setConfirmReset(false); toast({ title: 'Demoen er tilbakestilt', description: 'Saldo og fremdrift er som ved start.' }); },
    onError: (e) => toast({ title: 'Kunne ikke tilbakestille', description: errMsg(e), variant: 'destructive' }),
  });
  const doLogout = () => logout.mutate(undefined, {
    onSuccess: () => { qc.removeQueries({ queryKey: getGetBonusplayStateQueryKey() }); qc.clear(); nav('/'); window.location.reload(); },
    onError: (e) => toast({ title: 'Kunne ikke logge ut', description: errMsg(e), variant: 'destructive' }),
  });
  const Row = ({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) => (
    <Card className="flex items-center gap-4 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/8">{icon}</span><div className="min-w-0 flex-1"><div className="font-semibold">{title}</div><div className="text-xs text-muted-foreground">{text}</div></div>{children}</Card>);

  return (
    <>
      <PageHead eyebrow="Konto" title="Innstillinger" sub={`Innlogget som ${s.user.displayName} (${s.user.role === 'admin' ? 'admin-demo' : 'demobruker'})`} />
      <div className="space-y-3">
        <Row icon={<Bell className="h-5 w-5" />} title="Varsler" text="Vis varselprikker i appen (lagres på denne enheten)."><Switch checked={push} onCheckedChange={(v) => { setPush(v); localStorage.setItem('bp-push', v ? 'on' : 'off'); }} data-testid="switch-notifications" /></Row>
        <Row icon={<Download className="h-5 w-5" />} title="Installer appen" text="Legg BONUSPLAY på hjemskjermen."><Btn size="sm" variant="ghost" disabled={!deferred} onClick={() => deferred?.prompt?.()} data-testid="button-install">{deferred ? 'Installer' : 'Ikke tilgjengelig'}</Btn></Row>
        <Row icon={<RotateCcw className="h-5 w-5 text-amber-300" />} title="Tilbakestill demo" text="Gjenoppretter saldo, nivå, dagsrekke og oppdrag."><Btn size="sm" variant="ghost" onClick={() => setConfirmReset(true)} data-testid="button-reset">Tilbakestill</Btn></Row>
        <Row icon={<LogOut className="h-5 w-5 text-rose-300" />} title="Logg ut" text="Avslutter demoøkten."><Btn size="sm" variant="danger" loading={logout.isPending} onClick={doLogout} data-testid="button-logout">Logg ut</Btn></Row>
      </div>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {[['/help', 'Hjelp', HelpCircle], ['/privacy', 'Personvern', ShieldCheck], ['/terms', 'Vilkår', FileText]].map(([h, l, I]) => { const Ic = I as typeof HelpCircle; return (
          <Link key={h as string} href={h as string} className="glass flex items-center gap-2 rounded-2xl p-3 text-sm"><Ic className="h-4 w-4 text-primary" />{l as string}</Link>); })}
      </div>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className="glass rounded-[2rem] border-white/10">
          <AlertDialogHeader><AlertDialogTitle className="font-display">Tilbakestille demoen?</AlertDialogTitle><AlertDialogDescription>All fremdrift går tilbake til startverdiene. Dette kan ikke angres.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-full">Avbryt</AlertDialogCancel>
            <AlertDialogAction className="btn-gold rounded-full" onClick={(e) => { e.preventDefault(); doReset(); }} data-testid="button-confirm-reset">{reset.isPending ? 'Tilbakestiller ...' : 'Tilbakestill'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
