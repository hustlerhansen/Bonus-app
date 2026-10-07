import { useEffect, useMemo, useRef, useState } from 'react';
import { Crown, Flame, Gem, Heart, Moon, Star, Sun, Zap, type LucideIcon } from 'lucide-react';
import { Btn } from '@/components/bp';
import { useTrack } from '@/hooks/use-track';
import { Arena, GameResult } from './game-parts';

const ICONS: LucideIcon[] = [Star, Heart, Zap, Moon, Sun, Flame, Gem, Crown];
const deal = () => [...ICONS.keys(), ...ICONS.keys()].map((v) => ({ v, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.v);

export function MemoryGame({ disabled }: { disabled: boolean }) {
  const track = useTrack();
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(false);
  const cards = useMemo(() => (round >= 0 ? deal() : []), [round]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const lock = useRef(false);
  const won = matched.length === cards.length && started;

  useEffect(() => {
    if (open.length !== 2) return;
    lock.current = true;
    setMoves((m) => m + 1);
    const [a, b] = open;
    const t = setTimeout(() => {
      if (cards[a] === cards[b]) setMatched((m) => [...m, a, b]);
      setOpen([]);
      lock.current = false;
    }, 650);
    return () => clearTimeout(t);
  }, [open, cards]);

  const flip = (i: number) => { if (lock.current || open.includes(i) || matched.includes(i)) return; setOpen((o) => [...o, i]); };
  const again = () => { setRound((r) => r + 1); setOpen([]); setMatched([]); setMoves(0); setStarted(true); };

  return (
    <Arena>
      {!started && (<div className="text-center"><h3 className="font-display text-xl">Memory</h3><p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">Finn alle åtte par med færrest mulige trekk.</p>
        <Btn size="lg" className="mt-6" disabled={disabled} onClick={() => { track('game_started', 'game-memory'); setStarted(true); }} data-testid="button-start-memory">Start</Btn></div>)}
      {started && !won && (<div className="w-full max-w-sm"><div className="mb-3 flex justify-between text-sm text-muted-foreground"><span>Trekk: <b className="text-foreground" data-testid="text-moves">{moves}</b></span><span>Par: {matched.length / 2} / 8</span></div>
        <div className="grid grid-cols-4 gap-2.5">{cards.map((v, i) => {
          const up = open.includes(i) || matched.includes(i); const I = ICONS[v];
          return (<button key={i} onClick={() => flip(i)} aria-label={up ? 'Åpent kort' : 'Lukket kort'} data-testid={`card-memory-${i}`} className="relative aspect-square [perspective:600px]">
            <span className="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: up ? 'rotateY(180deg)' : 'none' }}>
              <span className="btn-electric absolute inset-0 grid place-items-center rounded-2xl [backface-visibility:hidden]"><Gem className="h-5 w-5 opacity-50" /></span>
              <span className={`absolute inset-0 grid place-items-center rounded-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${matched.includes(i) ? 'btn-gold' : 'bg-white/15'}`}><I className="h-7 w-7" /></span>
            </span></button>);
        })}</div></div>)}
      {won && <GameResult gameId="game-memory" missionId="mission-memory" disabled={disabled} onAgain={again} summary={<>Alle par funnet på <span className="gold-text">{moves}</span> trekk</>} />}
    </Arena>
  );
}
