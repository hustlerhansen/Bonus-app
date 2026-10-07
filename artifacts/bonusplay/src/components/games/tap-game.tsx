import { useEffect, useRef, useState } from 'react';
import { Hand } from 'lucide-react';
import { Btn } from '@/components/bp';
import { useTrack } from '@/hooks/use-track';
import { Arena, GameResult } from './game-parts';

export function TapGame({ disabled }: { disabled: boolean }) {
  const track = useTrack();
  const [phase, setPhase] = useState<'idle' | 'run' | 'done'>('idle');
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState(10);
  const endRef = useRef(0);

  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      const r = Math.max(0, endRef.current - performance.now());
      setLeft(r / 1000);
      if (r <= 0) { clearInterval(t); setPhase('done'); }
    }, 50);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => { track('game_started', 'game-tap'); setTaps(0); setLeft(10); endRef.current = performance.now() + 10000; setPhase('run'); };
  return (
    <Arena>
      {phase === 'idle' && (<div className="text-center"><h3 className="font-display text-xl">10 sekunder tap</h3><p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">Trykk så raskt du kan i ti sekunder.</p>
        <Btn size="lg" variant="gold" shine className="mt-6" disabled={disabled} onClick={start} data-testid="button-start-tap">Start</Btn></div>)}
      {phase === 'run' && (<div className="flex flex-col items-center gap-5">
        <div className="font-display text-4xl tabular-nums" data-testid="text-tap-time">{left.toFixed(1)}s</div>
        <button onPointerDown={() => setTaps((x) => x + 1)} data-testid="button-tap" aria-label="Trykk"
          className="btn-electric animate-pulse-ring grid h-44 w-44 touch-manipulation select-none place-items-center rounded-full transition-transform active:scale-90"><Hand className="h-16 w-16" /></button>
        <div className="font-display gold-text text-3xl tabular-nums" data-testid="text-taps">{taps}</div></div>)}
      {phase === 'done' && <GameResult gameId="game-tap" missionId="mission-game" disabled={disabled || taps === 0} onAgain={() => setPhase('idle')} summary={<><span className="gold-text">{taps}</span> trykk på 10 sekunder</>} />}
    </Arena>
  );
}
