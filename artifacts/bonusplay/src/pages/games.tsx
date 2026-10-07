import { useState } from 'react';
import { Brain, Hand, Zap } from 'lucide-react';
import { FeatureOff, PageHead } from '@/components/bp';
import { TapGame } from '@/components/games/tap-game';
import { ReactionGame } from '@/components/games/reaction-game';
import { MemoryGame } from '@/components/games/memory-game';
import { isFlagOn, useBpState } from '@/hooks/use-bp';

const games = [
  { id: 'tap', title: '10 sek tap', sub: 'Fart og rytme', icon: Hand },
  { id: 'reaction', title: 'Reaksjon', sub: 'Tilfeldig signal', icon: Zap },
  { id: 'memory', title: 'Memory', sub: 'Åtte par', icon: Brain },
] as const;

export default function GamesPage() {
  const s = useBpState();
  const [sel, setSel] = useState<(typeof games)[number]['id']>('tap');
  const off = !isFlagOn(s, 'GAMES');
  return (
    <>
      <PageHead eyebrow="Spillrom" title="Spill" sub="Spill en runde og hent belønningen. Serveren godkjenner og begrenser daglig opptjening." />
      {off && <div className="mb-4"><FeatureOff name="Spill" /></div>}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {games.map((g) => (
          <button key={g.id} onClick={() => setSel(g.id)} data-testid={`button-game-${g.id}`}
            className={`glass rounded-3xl p-4 text-left transition hover:-translate-y-0.5 ${sel === g.id ? 'glass-glow ring-1 ring-primary/50' : ''}`}>
            <div className={`mb-3 grid h-10 w-10 place-items-center rounded-2xl ${sel === g.id ? 'btn-electric' : 'bg-white/10'}`}><g.icon className="h-5 w-5" /></div>
            <div className="font-display text-xs sm:text-sm">{g.title}</div><div className="text-[11px] text-muted-foreground">{g.sub}</div>
          </button>))}
      </div>
      <div key={sel}>
        {sel === 'tap' && <TapGame disabled={off} />}
        {sel === 'reaction' && <ReactionGame disabled={off} />}
        {sel === 'memory' && <MemoryGame disabled={off} />}
      </div>
    </>
  );
}
