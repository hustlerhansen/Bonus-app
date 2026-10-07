import { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { Btn } from '@/components/bp';
import { useTrack } from '@/hooks/use-track';
import { Arena, GameResult } from './game-parts';

export function ReactionGame({ disabled }: { disabled: boolean }) {
  const track = useTrack();
  const [phase, setPhase] = useState<'idle' | 'wait' | 'go' | 'early' | 'done'>('idle');
  const [ms, setMs] = useState(0);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const arm = () => {
    track('game_started', 'game-reaction');
    setPhase('wait');
    timer.current = setTimeout(() => { t0.current = performance.now(); setPhase('go'); }, 1500 + Math.random() * 3500);
  };
  const press = () => {
    if (phase === 'wait') { clearTimeout(timer.current); setPhase('early'); }
    else if (phase === 'go') { setMs(Math.round(performance.now() - t0.current)); setPhase('done'); }
  };
  const bg = phase === 'go' ? 'btn-gold' : phase === 'wait' ? 'bg-destructive/30' : 'bg-white/8';
  return (
    <Arena>
      {(phase === 'idle' || phase === 'early') && (<div className="text-center"><h3 className="font-display text-xl">{phase === 'early' ? 'For tidlig' : 'Reaksjonstest'}</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{phase === 'early' ? 'Vent til flaten lyser gull. Prøv igjen.' : 'Vent til flaten lyser gull, og trykk så fort du kan. Ventetiden er tilfeldig.'}</p>
        <Btn size="lg" className="mt-6" disabled={disabled} onClick={arm} data-testid="button-start-reaction">{phase === 'early' ? 'Prøv igjen' : 'Start'}</Btn></div>)}
      {(phase === 'wait' || phase === 'go') && (
        <button onPointerDown={press} data-testid="button-reaction-pad" className={`${bg} grid h-64 w-full max-w-sm touch-manipulation select-none place-items-center rounded-[2rem] transition-colors`}>
          <div className="flex flex-col items-center gap-2"><Zap className="h-12 w-12" /><span className="font-display text-xl">{phase === 'wait' ? 'Vent ...' : 'TRYKK NÅ'}</span></div></button>)}
      {phase === 'done' && <GameResult gameId="game-reaction" missionId="mission-reaction" disabled={disabled} onAgain={() => setPhase('idle')} summary={<>Reaksjonstid <span className="gold-text" data-testid="text-reaction-ms">{ms} ms</span></>} />}
    </Arena>
  );
}
