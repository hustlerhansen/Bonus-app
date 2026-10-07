import type { ReactNode } from 'react';
import { Card } from '@/components/bp';
import { ClaimButton } from '@/components/claim-button';
import { useBpState } from '@/hooks/use-bp';

/** Etter spill: hent spillbelønning, deretter evt. tilhørende oppdrag. */
export function GameResult({ gameId, missionId, summary, onAgain, disabled }: { gameId: string; missionId: string; summary: ReactNode; onAgain: () => void; disabled: boolean }) {
  const s = useBpState();
  const mission = s.missions.find((m) => m.id === missionId);
  return (
    <div className="animate-pop space-y-4 text-center">
      <div className="font-display text-2xl">{summary}</div>
      <div className="flex flex-wrap justify-center gap-2">
        <ClaimButton activityId={gameId} label="Hent spillbelønning" disabled={disabled} />
        {mission && mission.enabled && !mission.completed && <ClaimButton activityId={missionId} variant="electric" label={`Fullfør: ${mission.title}`} disabled={disabled} />}
        <button onClick={onAgain} data-testid={`button-again-${gameId}`} className="bp-btn btn-ghost h-11 px-6 text-sm">Spill igjen</button>
      </div>
    </div>
  );
}
export function Arena({ children }: { children: ReactNode }) {
  return <Card glow className="relative flex min-h-[22rem] flex-col items-center justify-center overflow-hidden">{children}</Card>;
}
