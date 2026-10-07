import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ErrorState, Logo, PageSkeleton } from '@/components/bp';
import { Shell } from '@/components/shell';
import { StateContext, errStatus, useBpQuery } from '@/hooks/use-bp';
import Onboarding from '@/pages/onboarding';

export function Protected({ children, allowAnon }: { children: ReactNode; allowAnon?: boolean }) {
  const q = useBpQuery();
  const unauth = q.isError && errStatus(q.error) === 401;

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-5 pt-16"><div className="mb-8 flex justify-center"><Logo /></div><PageSkeleton /></div>
    );
  }
  if (unauth) {
    if (allowAnon) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="mb-6 flex items-center justify-between"><Logo /><Link href="/" className="text-sm text-primary" data-testid="link-back-start">Tilbake til start</Link></div>
          {children}
        </div>
      );
    }
    return <Onboarding />;
  }
  if (q.isError || !q.data) {
    return <div className="p-6 pt-20"><ErrorState message="Kunne ikke laste kontoen din." onRetry={() => q.refetch()} /></div>;
  }
  return (
    <StateContext.Provider value={q.data}>
      <Shell>{children}</Shell>
    </StateContext.Provider>
  );
}
