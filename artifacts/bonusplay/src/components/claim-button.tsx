import type { ReactNode } from 'react';
import { CheckCircle2, Gift } from 'lucide-react';
import { Btn } from '@/components/bp';
import { useClaim } from '@/hooks/use-bp';

export function ClaimButton({ activityId, label = 'Hent belønning', done, disabled, onDone, variant = 'gold', className, icon }: {
  activityId: string; label?: string; done?: boolean; disabled?: boolean; onDone?: () => void; variant?: 'gold' | 'electric'; className?: string; icon?: ReactNode;
}) {
  const { claim, isBusy } = useClaim();
  if (done) return <Btn variant="ghost" disabled className={className} icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}>Fullført</Btn>;
  return (
    <Btn variant={variant} shine className={className} loading={isBusy(activityId)} disabled={disabled} icon={icon ?? <Gift className="h-4 w-4" />}
      data-testid={`button-claim-${activityId}`}
      onClick={async () => { const r = await claim(activityId); if (r) onDone?.(); }}>{label}</Btn>
  );
}
