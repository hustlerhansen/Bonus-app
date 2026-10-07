import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Btn, Pts } from '@/components/bp';
import { useClaim } from '@/hooks/use-bp';

export type Activity = { id: string; title: string; description: string; points: number; xp: number; kind: 'ad' | 'survey' | 'offer' | 'generic' };

const QUESTIONS = [
  { q: 'Hvor ofte bruker du tjenesten i uken?', o: ['Sjelden', '1 til 3 ganger', 'Nesten daglig'] },
  { q: 'Hva er viktigst for deg når du velger?', o: ['Pris', 'Kvalitet', 'Enkelhet'] },
  { q: 'Hvor sannsynlig er det at du anbefaler den videre?', o: ['Lite sannsynlig', 'Kanskje', 'Svært sannsynlig'] },
];

export function ActivityDialog({ activity, onClose }: { activity: Activity | null; onClose: () => void }) {
  const { claim, isBusy } = useClaim();
  const [secs, setSecs] = useState(5);
  const [running, setRunning] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [opened, setOpened] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => { setSecs(5); setRunning(false); setAnswers({}); setOpened(false); }, [activity?.id]);
  useEffect(() => {
    if (!running) return;
    if (secs <= 0) { setRunning(false); return; }
    const t = setTimeout(() => setSecs((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [running, secs]);

  if (!activity) return null;
  const a = activity;
  const ready = a.kind === 'ad' ? secs <= 0 : a.kind === 'survey' ? Object.keys(answers).length === QUESTIONS.length : a.kind === 'offer' ? opened : true;
  const submit = async () => { const r = await claim(a.id); if (r) closeRef.current(); };
  const R = 38, C = 2 * Math.PI * R;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass max-h-[90dvh] max-w-md overflow-y-auto rounded-[2rem] border-white/10" data-testid="dialog-activity">
        <DialogTitle className="font-display text-xl">{a.title}</DialogTitle>
        <DialogDescription>{a.description}</DialogDescription>
        <div className="flex gap-2"><Pts value={a.points} /><Pts value={a.xp} kind="xp" /></div>

        {a.kind === 'ad' && (
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-primary/20 to-accent/20 p-6 text-center">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Demoannonse, ingen ekte leverandør</div>
            <div className="relative mx-auto my-4 h-28 w-28">
              <svg viewBox="0 0 90 90" className="-rotate-90"><circle cx="45" cy="45" r={R} fill="none" stroke="hsl(0 0% 100% / .1)" strokeWidth="7" />
                <circle cx="45" cy="45" r={R} fill="none" stroke="hsl(45 100% 60%)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (running || secs < 5 ? secs / 5 : 1)} style={{ transition: 'stroke-dashoffset 1s linear' }} /></svg>
              <div className="font-display absolute inset-0 grid place-items-center text-3xl" data-testid="text-countdown">{secs}</div>
            </div>
            {!running && secs === 5 && <Btn variant="electric" icon={<Play className="h-4 w-4" />} onClick={() => setRunning(true)} data-testid="button-start-ad">Start annonse</Btn>}
            {running && <p className="text-sm text-muted-foreground">Vent til nedtellingen er ferdig</p>}
            {secs <= 0 && <p className="text-sm text-emerald-300">Ferdig, du kan hente belønningen</p>}
          </div>
        )}

        {a.kind === 'survey' && (
          <div className="space-y-4">
            {QUESTIONS.map((q, qi) => (
              <fieldset key={qi}><legend className="mb-2 text-sm font-semibold">{qi + 1}. {q.q}</legend>
                <div className="flex flex-wrap gap-2">{q.o.map((o, oi) => (
                  <button key={o} type="button" onClick={() => setAnswers((x) => ({ ...x, [qi]: oi }))} data-testid={`option-${qi}-${oi}`}
                    className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${answers[qi] === oi ? 'btn-electric border-transparent' : 'border-white/15 bg-white/5'}`}>{o}</button>))}
                </div></fieldset>
            ))}
          </div>
        )}

        {a.kind === 'offer' && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
            <p className="text-sm text-muted-foreground">Dette er et simulert partnertilbud. Ingen ekstern side åpnes og ingen data deles.</p>
            <Btn className="mt-4" variant="ghost" icon={<ExternalLink className="h-4 w-4" />} onClick={() => setOpened(true)} data-testid="button-open-offer">{opened ? 'Demotilbud åpnet' : 'Åpne demotilbud'}</Btn>
          </div>
        )}

        <Btn size="lg" variant="gold" shine className="w-full" disabled={!ready} loading={isBusy(a.id)} onClick={submit} data-testid="button-submit-activity">
          {ready ? 'Hent belønning' : a.kind === 'survey' ? 'Svar på alle spørsmål' : a.kind === 'offer' ? 'Åpne tilbudet først' : 'Venter'}
        </Btn>
      </DialogContent>
    </Dialog>
  );
}
