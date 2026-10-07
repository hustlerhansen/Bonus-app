import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Diamond, Frame, Headline, useBeat } from '../FilmElements';
export function Scene5() {
  const beat = useBeat([800, 1100, 2000, 2900, 3700, 4700]);
  return <Frame theme="cream" number={5}>
    <Headline>UTFORSK<br />BELØNNINGER.</Headline>
    <motion.div className="gift-card" initial={{ rotateX: 45, rotate: -7, scale: .8 }} animate={{ rotateX: 0, rotate: beat >= 6 ? 8 : -7, scale: beat >= 6 ? .85 : 1, y: beat >= 6 ? '-4vh' : 0 }} transition={{ duration: .8 }}>
      <div className="gift-brand">BONUS<span>PLAY</span></div><div className="gift-label">GAVEKORT</div>
      <motion.div className="gift-value" initial={{ opacity: .4, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .6 }}>100<small>kr</small></motion.div>
      <div className="gift-demo">DEMO</div><Diamond className="gift-logo" />
      <motion.div className="gift-light" animate={{ x: beat >= 5 ? '170%' : '-150%' }} transition={{ duration: .9 }} />
    </motion.div>
    <motion.div className="reward-cost" initial={{ opacity: .2 }} animate={{ opacity: beat >= 2 ? 1 : .2 }}>10 000 poeng</motion.div>
    <motion.div className="reward-status" initial={{ opacity: 0, scale: .8 }} animate={{ opacity: beat >= 4 ? 1 : 0, scale: beat >= 4 ? 1 : .8 }}><Check /> BESTILT · DEMO</motion.div>
    <motion.p className="reward-disclaimer" initial={{ opacity: 0 }} animate={{ opacity: beat >= 3 ? 1 : 0 }}>Ingen ekte utbetalinger.</motion.p>
    <motion.div className="reward-facet" animate={{ scale: beat >= 6 ? 1 : .1, rotate: beat >= 6 ? 0 : 45, opacity: beat >= 6 ? 1 : 0 }} transition={{ duration: .8 }}><Diamond /></motion.div>
  </Frame>;
}
