import { AnimatePresence, motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { Caption, Diamond, Frame, Headline, useBeat, useCounter } from '../FilmElements';
export function Scene3() {
  const beat = useBeat([300, 1000, 1700, 2200, 2900, 3600, 4000, 4200]);
  const score = useCounter(1, 24, 300, 1400);
  return <Frame theme="blue" number={3}>
    <div className="speed-lines" />
    <Headline>SPILL I<br />DITT TEMPO.</Headline>
    <AnimatePresence mode="sync">
      {beat < 4 ? <motion.div className="game-target" key="tap" initial={{ scale: 1.4 }} animate={{ scale: 1 }} exit={{ scale: .8, opacity: 0 }}>
        {[0, 1, 2].map(i => <motion.div className="tap-ripple" key={i} animate={{ scale: [1, 1.4, 1], opacity: [.7, .05, .7] }} transition={{ duration: .8, delay: i * .2, repeat: 2 }} />)}
        <div className="tap-score">{score.padStart(2, '0')}</div><span className="tap-label">TRYKK</span>
      </motion.div> : beat < 6 ? <motion.div className="memory-grid" key="memory" initial={{ scale: .8, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: .8, opacity: 0 }}>
        {[0, 1, 2, 3].map(i => <motion.div key={i} className="memory-tile" animate={{ rotateY: beat >= 5 || i % 2 === 0 ? 0 : 180 }} transition={{ duration: .4, delay: i * .05 }}><Diamond /></motion.div>)}
      </motion.div> : <motion.div className={`reaction-disc ${beat >= 7 ? 'go' : ''}`} key="reaction" initial={{ scale: .9 }} animate={{ scale: beat >= 8 ? 1.08 : 1, rotate: beat >= 8 ? 12 : 0, y: beat >= 8 ? '-3vh' : 0 }} transition={{ duration: .6 }}><Zap /><strong>{beat >= 7 ? 'NÅ!' : 'VENT'}</strong></motion.div>}
    </AnimatePresence>
    <div className="game-name">{beat < 4 ? 'Tap Challenge' : beat < 6 ? 'Memory' : 'Reaksjonstest'}</div>
    {beat === 3 && <motion.div className="game-reward" initial={{ scale: .8 }} animate={{ scale: 1 }}>+40 poeng · +20 XP</motion.div>}
    <Caption delay={3.9}>Tre minispill.<br />Én leken pause.</Caption>
  </Frame>;
}
