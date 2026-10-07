import { useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, ClipboardList, Flame, Gamepad2, Gift, Megaphone, Target, Users, Zap } from 'lucide-react';
import type { Mission } from '@workspace/api-client-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Btn, Card, FeatureOff, PageHead, Pts } from '@/components/bp';
import { ActivityDialog, type Activity } from '@/components/activity-dialog';
import { useTrack } from '@/hooks/use-track';
import { isFlagOn, useBpState, type FeatureKey } from '@/hooks/use-bp';

const icons: Record<string, typeof Target> = { WATCH_AD: Megaphone, PLAY_GAME: Gamepad2, SURVEY: ClipboardList, OFFER: Gift, DAILY_CHALLENGE: Zap, REFERRAL: Users, STREAK: Flame };
const flagOf: Record<string, FeatureKey | undefined> = { WATCH_AD: 'ADS', PLAY_GAME: 'GAMES', SURVEY: 'SURVEYS', OFFER: 'OFFERS', REFERRAL: 'REFERRALS' };
const flagName: Record<string, string> = { ADS: 'Annonser', GAMES: 'Spill', SURVEYS: 'Undersøkelser', OFFERS: 'Tilbud', REFERRALS: 'Verving' };

export default function MissionsPage() {
  const s = useBpState();
  const [, nav] = useLocation();
  const [tab, setTab] = useState('missions');
  const [act, setAct] = useState<Activity | null>(null);
  const track = useTrack();
  const begin = (a: Activity) => { track(a.kind === 'ad' ? 'ad_started' : a.kind === 'survey' ? 'survey_started' : a.kind === 'offer' ? 'offer_started' : 'mission_started', a.id); setAct(a); };

  const open = (m: Mission) => {
    if (m.id === 'mission-survey') return setTab('surveys');
    if (m.id === 'mission-offer') return setTab('offers');
    if (m.type === 'PLAY_GAME' || m.id === 'mission-game' || m.id === 'mission-memory' || m.id === 'mission-reaction') return nav('/games');
    if (m.type === 'REFERRAL') return nav('/referrals');
    begin({ id: m.id, title: m.title, description: m.description, points: m.points, xp: m.xp, kind: m.type === 'WATCH_AD' ? 'ad' : 'generic' });
  };
  const label = (m: Mission) => (m.id === 'mission-survey' ? 'Velg undersøkelse' : m.id === 'mission-offer' ? 'Se tilbud' : m.type === 'PLAY_GAME' ? 'Spill nå' : m.type === 'REFERRAL' ? 'Verv venner' : m.type === 'WATCH_AD' ? 'Se annonse' : 'Fullfør');

  return (
    <>
      <PageHead eyebrow="Daglig" title="Oppdrag" sub="Fullfør oppdrag for poeng og erfaring. Serveren bestemmer beløp og daglige grenser." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 grid h-auto w-full grid-cols-3 rounded-full bg-white/5 p-1">
          {[['missions', 'Oppdrag'], ['surveys', 'Undersøkelser'], ['offers', 'Tilbud']].map(([v, l]) => (
            <TabsTrigger key={v} value={v} data-testid={`tab-${v}`} className="rounded-full py-2.5 text-xs font-semibold data-[state=active]:btn-electric data-[state=active]:text-white sm:text-sm">{l}</TabsTrigger>))}
        </TabsList>

        <TabsContent value="missions" className="space-y-3">
          {s.missions.map((m, k) => {
            const Ic = icons[m.type] ?? Target;
            const f = flagOf[m.type];
            const off = f ? !isFlagOn(s, f) : false;
            const unavailable = !m.enabled || off;
            return (
              <Card key={m.id} className="rise flex items-center gap-4 p-4" style={{ animationDelay: `${k * 0.04}s` }} data-testid={`card-mission-${m.id}`}>
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${m.completed ? 'bg-emerald-400/15 text-emerald-300' : 'btn-electric'}`}>{m.completed ? <CheckCircle2 /> : <Ic />}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.title}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{m.description}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><Pts value={m.points} /><Pts value={m.xp} kind="xp" />{off && f && <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200">{flagName[f]} avslått</span>}</div>
                </div>
                <Btn size="sm" variant={m.completed ? 'ghost' : 'electric'} disabled={m.completed || unavailable} onClick={() => open(m)} data-testid={`button-mission-${m.id}`}>
                  {m.completed ? 'Fullført' : unavailable ? 'Utilgjengelig' : label(m)}</Btn>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="surveys" className="space-y-3">
          {!isFlagOn(s, 'SURVEYS') && <FeatureOff name="Undersøkelser" />}
          {s.surveys.map((sv) => (
            <Card key={sv.id} className="flex items-center gap-4 p-4" data-testid={`card-survey-${sv.id}`}>
              <div className="btn-electric grid h-12 w-12 shrink-0 place-items-center rounded-2xl"><ClipboardList /></div>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{sv.title}</div><div className="text-xs text-muted-foreground">Ca. {sv.minutes} min</div>
                <div className="mt-2 flex gap-1.5"><Pts value={sv.points} /><Pts value={sv.xp} kind="xp" /></div></div>
              <Btn size="sm" disabled={sv.completed || !isFlagOn(s, 'SURVEYS')} variant={sv.completed ? 'ghost' : 'electric'} data-testid={`button-survey-${sv.id}`}
                onClick={() => begin({ id: sv.id, title: sv.title, description: `Svar på tre korte spørsmål, ca. ${sv.minutes} minutter. Demo.`, points: sv.points, xp: sv.xp, kind: 'survey' })}>{sv.completed ? 'Fullført' : 'Start'}</Btn>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="offers" className="space-y-3">
          {!isFlagOn(s, 'OFFERS') && <FeatureOff name="Tilbud" />}
          {s.offers.map((o) => (
            <Card key={o.id} className="flex items-center gap-4 p-4" data-testid={`card-offer-${o.id}`}>
              <div className="btn-gold grid h-12 w-12 shrink-0 place-items-center rounded-2xl"><Gift /></div>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{o.title}</div><div className="line-clamp-2 text-xs text-muted-foreground">{o.description}</div>
                <div className="mt-2 flex gap-1.5"><Pts value={o.points} /><Pts value={o.xp} kind="xp" /></div></div>
              <Btn size="sm" disabled={o.completed || !isFlagOn(s, 'OFFERS')} variant={o.completed ? 'ghost' : 'gold'} data-testid={`button-offer-${o.id}`}
                onClick={() => begin({ id: o.id, title: o.title, description: o.description, points: o.points, xp: o.xp, kind: 'offer' })}>{o.completed ? 'Fullført' : 'Åpne'}</Btn>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
      <ActivityDialog activity={act} onClose={() => setAct(null)} />
    </>
  );
}
