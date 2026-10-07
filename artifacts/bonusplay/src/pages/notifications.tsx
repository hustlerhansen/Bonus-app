import { useQueryClient } from '@tanstack/react-query';
import { NotificationReadInputNotificationIdsItem, getGetBonusplayStateQueryKey, useMarkNotificationsRead } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Btn, Card, Empty, PageHead } from '@/components/bp';
import { errMsg, useBpState } from '@/hooks/use-bp';

const IDS = Object.values(NotificationReadInputNotificationIdsItem) as string[];

export default function NotificationsPage() {
  const s = useBpState();
  const qc = useQueryClient();
  const { toast } = useToast();
  const m = useMarkNotificationsRead();
  const isRead = (_id: string, r: boolean) => r;
  const mark = (ids: string[]) => {
    const valid = ids.filter((i) => IDS.includes(i)) as NotificationReadInputNotificationIdsItem[];
    if (valid.length === 0 || m.isPending) return;
    m.mutate({ data: { notificationIds: valid } }, {
      onSuccess: (st) => { qc.setQueryData(getGetBonusplayStateQueryKey(), st); qc.invalidateQueries({ queryKey: getGetBonusplayStateQueryKey() }); },
      onError: (e) => toast({ title: 'Kunne ikke oppdatere varsler', description: errMsg(e), variant: 'destructive' }),
    });
  };
  const unread = s.notifications.filter((n) => !isRead(n.id, n.read));
  return (
    <>
      <PageHead eyebrow="Innboks" title="Varsler" action={<Btn size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} disabled={unread.length === 0} loading={m.isPending} onClick={() => mark(unread.map((n) => n.id))} data-testid="button-mark-all">Merk alle lest</Btn>} />
      {s.notifications.length === 0 ? <Empty icon={<BellOff />} title="Ingen varsler" text="Du er à jour." /> : (
        <div className="space-y-2">{s.notifications.map((n) => { const r = isRead(n.id, n.read); return (
          <button key={n.id} onClick={() => !r && mark([n.id])} data-testid={`card-notification-${n.id}`} className="block w-full text-left">
            <Card className={`flex items-start gap-3 p-4 transition ${r ? 'opacity-60' : 'ring-1 ring-primary/40'}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r ? 'bg-white/8' : 'btn-electric'}`}><Bell className="h-5 w-5" /></span>
              <span className="flex-1 text-sm">{n.message}</span>{!r && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent" />}
            </Card></button>); })}</div>)}
    </>
  );
}
