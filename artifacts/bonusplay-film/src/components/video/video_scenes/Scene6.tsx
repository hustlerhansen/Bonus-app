import { motion } from 'framer-motion';
import { Diamond, Frame, useBeat } from '../FilmElements';
export function Scene6() {
  const beat = useBeat([600, 1000, 1700, 2100, 3200, 4200]);
  return <Frame theme="gold" number={6}>
    <motion.div className="final-diamond" initial={{ scale: .75, rotate: 25 }} animate={{ scale: beat >= 6 ? .85 : 1, rotate: 0, y: beat >= 6 ? '2vh' : 0 }} transition={{ duration: .8 }}><Diamond /></motion.div>
    <motion.h1 className="final-brand" initial={{ clipPath: 'inset(100% 0 0 0)' }} animate={{ clipPath: 'inset(0% 0 0 0)' }} transition={{ delay: .6, duration: .7 }}>BONUSPLAY</motion.h1>
    <motion.p className="final-tagline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: beat >= 2 ? 1 : 0, y: 0 }}>Spill. Tjen. Opplev.</motion.p>
    <motion.div className="final-rule" animate={{ scaleX: beat >= 5 ? 1 : .1 }} transition={{ duration: 1 }} />
    <motion.p className="final-sub" initial={{ opacity: 0 }} animate={{ opacity: beat >= 3 ? 1 : 0 }}>Norsk belønningsplattform · 18+</motion.p>
    <motion.p className="final-demo" initial={{ opacity: 0 }} animate={{ opacity: beat >= 4 ? 1 : 0 }}>DEMO · Ingen ekte utbetalinger.</motion.p>
    <motion.div className="loop-iris" animate={{ scale: beat >= 6 ? 1 : 0 }} transition={{ duration: 1 }} />
  </Frame>;
}
