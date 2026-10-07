import { AnimatePresence, motion } from 'framer-motion';
import { Caption, Coin, Diamond, EASE, Frame, useBeat } from '../FilmElements';
export function Scene1() {
  const beat = useBeat([500, 1100, 1600, 2200, 2700, 3300, 3500]);
  const word = beat < 2 ? 'SPILL.' : beat < 4 ? 'TJEN.' : 'OPPLEV.';
  return <Frame theme="navy" number={1}>
    <div className="masthead">BONUS<span>PLAY</span></div>
    <div className="outline-word">{word}</div>
    <AnimatePresence mode="sync"><motion.h1 className="kinetic-word" key={word}
      initial={{ scale: 1.25, opacity: .3, rotate: -3 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      exit={{ y: -40, opacity: 0 }} transition={{ type: 'spring', stiffness: 340, damping: 24 }}>{word}</motion.h1></AnimatePresence>
    <motion.div className="hero-diamond" initial={{ scale: .8, rotate: -10 }} animate={{ scale: beat >= 6 ? .8 : 1, rotate: beat % 2 ? 6 : -4 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}><Diamond /></motion.div>
    <motion.div className="orbit" animate={{ rotate: 180 }} transition={{ duration: 4.2, ease: 'linear' }} />
    <motion.div className="carrier-coin" animate={{ scale: beat >= 7 ? 3.2 : 1, x: beat >= 7 ? 0 : '24vw', y: beat >= 7 ? 0 : '18vh', opacity: beat >= 7 ? .35 : 1 }} transition={{ duration: .7, ease: EASE }}><Coin /></motion.div>
    <Caption delay={2.7}>Små aktiviteter.<br />Nye muligheter.</Caption>
  </Frame>;
}
