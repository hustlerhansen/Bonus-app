import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  getGetBonusplayStateQueryKey,
  useClaimActivity,
  useGetBonusplayState,
  type BonusplayState,
  type ClaimResult,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useReward } from '@/components/reward-modal';

export type FeatureKey = 'ADS' | 'SURVEYS' | 'OFFERS' | 'GAMES' | 'EVENTS' | 'LEADERBOARDS' | 'REFERRALS' | 'REDEMPTIONS' | 'CHESTS';

export const StateContext = createContext<BonusplayState | null>(null);
export function useBpState(): BonusplayState {
  const s = useContext(StateContext);
  if (!s) throw new Error('BonusplayState mangler');
  return s;
}

export function useBpQuery() {
  return useGetBonusplayState({
    query: { queryKey: getGetBonusplayStateQueryKey(), retry: false, staleTime: 20_000, refetchOnWindowFocus: false },
  });
}

export function isFlagOn(state: BonusplayState, key: FeatureKey): boolean {
  const f = state.featureFlags.find((x) => x.key === key);
  return f ? f.enabled : true;
}

export function errStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}
export function errMsg(e: unknown): string {
  const d = (e as { data?: { error?: string } } | null)?.data;
  if (d?.error) return d.error;
  const m = (e as Error | null)?.message;
  return m && !m.startsWith('HTTP') ? m : 'Noe gikk galt. Prøv igjen om litt.';
}

export function applyResult(qc: QueryClient, result: ClaimResult) {
  qc.setQueryData(getGetBonusplayStateQueryKey(), result.state);
  qc.invalidateQueries({ queryKey: getGetBonusplayStateQueryKey() });
}

/** Claim med idempotensnøkkel per fullført aktivitet. Blokkerer dobbeltklikk. */
export function useClaim() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { show } = useReward();
  const m = useClaimActivity();
  const mutateRef = useRef(m.mutateAsync);
  mutateRef.current = m.mutateAsync;
  const keys = useRef(new Map<string, string>());
  const inflight = useRef(new Set<string>());
  const [busy, setBusy] = useState<string[]>([]);

  const claim = useCallback(
    async (activityId: string): Promise<ClaimResult | null> => {
      if (inflight.current.has(activityId)) return null;
      inflight.current.add(activityId);
      setBusy(Array.from(inflight.current));
      let key = keys.current.get(activityId);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(activityId, key);
      }
      try {
        const res = await mutateRef.current({ data: { activityId, idempotencyKey: key } });
        keys.current.delete(activityId);
        applyResult(qc, res);
        show(res);
        return res;
      } catch (e) {
        toast({ title: 'Kunne ikke hente belønning', description: errMsg(e), variant: 'destructive' });
        return null;
      } finally {
        inflight.current.delete(activityId);
        setBusy(Array.from(inflight.current));
      }
    },
    [qc, toast, show],
  );
  return { claim, isBusy: (id: string) => busy.includes(id), anyBusy: busy.length > 0 };
}
