import { useEffect, type ReactNode } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useAuth, useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetV2AccountQueryKey, getListV2AdminRequestsQueryKey, useCreateV2AdminRequest, useGetV2Account, type V2AdminRequest, type V2AdminRequestInputAction } from '@workspace/api-client-react';
import { Btn, Logo, PageSkeleton } from '@/components/bp';
import { usePageMeta } from '@/hooks/use-page-meta';
import { cn } from '@/lib/utils';

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function useV2State() {
  const { isLoaded, isSignedIn } = useAuth();
  return useGetV2Account({ query: { enabled: isLoaded && !!isSignedIn, queryKey: getGetV2AccountQueryKey() } });
}

export function fmtDate(s?: string | null) {
  if (!s) return '-';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function PhaseNotice({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100', className)} data-testid="notice-phase">
      <b>Lukket oppstart.</b> Du kan opprette konto og følge saldoen din nå. Tilbud fra partnere og innløsning av gavekort åpnes gradvis. Opptjente BonusPoints utløper ikke.
    </div>
  );
}

export function useIsAdmin() {
  const r = useV2State().data?.account?.role;
  return r === 'ADMIN' || r === 'SUPER_ADMIN';
}

export function V2Frame({ children, title, desc, nav }: { children: ReactNode; title: string; desc: string; nav?: boolean }) {
  usePageMeta(title, desc);
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);
  const [loc] = useLocation();
  const clerk = useClerk();
  const qc = useQueryClient();
  const out = () => clerk.signOut({ redirectUrl: `${basePath}/` }).then(() => qc.clear());
  const isAdmin = useIsAdmin();
  const links: [string, string][] = [['/account', 'Hjem'], ['/account/offers', 'Tjen poeng'], ['/account/rewards', 'Gavekort'], ['/account/points', 'Historikk'], ['/account/orders', 'Bestillinger'], ...(isAdmin ? [['/account/admin', 'Admin'] as [string, string]] : []), ['/account/profile', 'Profil']];
  return (
    <div className="mx-auto min-h-[100dvh] max-w-3xl px-4 pb-16 pt-5">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={nav ? '/account' : '/'}><Logo /></Link>
        {nav ? (
          <Btn size="sm" variant="ghost" onClick={out} data-testid="button-v2-logout">Logg ut</Btn>
        ) : (
          <div className="flex gap-3 text-sm"><Link href="/business" className="text-muted-foreground">For bedrifter</Link><Link href="/sign-in" className="text-muted-foreground">Logg inn</Link></div>
        )}
      </header>
      {nav && (
        <nav className="mb-6 flex gap-1 overflow-x-auto rounded-full bg-white/5 p-1 text-sm" aria-label="Konto">
          {links.map(([h, l]) => (
            <Link key={h} href={h} className={cn('whitespace-nowrap rounded-full px-4 py-2 font-bold', (h === '/account' || h === '/account/points' ? loc === h : loc === h || loc.startsWith(`${h}/`)) ? 'btn-electric' : 'text-muted-foreground')}>{l}</Link>
          ))}
        </nav>
      )}
      {children}
      <footer className="mt-12 text-center text-[11px] text-muted-foreground">
        <Link href="/terms" className="underline">Vilkår (utkast)</Link> · <Link href="/privacy" className="underline">Personvern (utkast)</Link> · <Link href="/help" className="underline">Hjelp</Link>
      </footer>
    </div>
  );
}

export function SignedInOnly({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="mx-auto max-w-3xl p-5 pt-16"><PageSkeleton /></div>;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <>{children}</>;
}

export function ScrollTop() {
  useEffect(() => window.scrollTo(0, 0), []);
  return null;
}

export function fmtDateTime(s?: string | null) {
  if (!s) return '-';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function queuedText(r: V2AdminRequest) {
  return `Sendt til godkjenningskøen. Kan bekreftes tidligst ${fmtDateTime(r.notBefore)} under Admin → Godkjenninger.`;
}

export function apiErrorCode(e: unknown): string | undefined {
  return (e as { data?: { code?: string } } | null)?.data?.code;
}

/** High-risk actions are recorded first and executed after the cooldown and an MFA-verified confirmation. */
export function useApprovalRequest() {
  const qc = useQueryClient();
  const m = useCreateV2AdminRequest();
  const send = (action: V2AdminRequestInputAction, payload: Record<string, unknown>, reason: string,
    cb: { onQueued: (r: V2AdminRequest) => void; onError: (e: unknown) => void }) => {
    m.mutate({ data: { action, payload, reason, requestKey: crypto.randomUUID() } }, {
      onSuccess: (r) => { void qc.invalidateQueries({ queryKey: getListV2AdminRequestsQueryKey() }); cb.onQueued(r); },
      onError: cb.onError,
    });
  };
  return { send, isPending: m.isPending };
}
