import { motion } from 'framer-motion';
import { Check, Coins, Play, Sparkles } from 'lucide-react';
import { Caption, Coin, EASE, Frame, Headline, useBeat, useCounter } from '../FilmElements';
export function Scene2() {
  const beat = useBeat([800, 1600, 2300, 3100, 3400, 4100]);
  const balance = useCounter(12450, 12470, 2500, 600);
  return <Frame theme="violet" number={2}>
    <div className="blueprint" />
    <Headline>LITT INNSATS.<br /><span>MER FREMGANG.</span></Headline>
    <motion.div className="balance-panel" initial={{ scale: 1.5, rotate: 5 }}
      animate={{ scale: beat >= 6 ? 1.13 : 1, rotate: beat >= 6 ? -6 : -2 }} transition={{ duration: .7, ease: EASE }}>
      <div className="panel-eyebrow"><Coins /> POENGBALANSE</div>
      <div className="balance">{balance}</div><div className="panel-sub">Level 7 <span>·</span> Din fremgang</div>
      <div className={`mission ${beat >= 3 ? 'complete' : ''}`}>
        <div className="mission-icon">{beat >= 3 ? <Check /> : <Play />}</div>
        <div><strong>Annonse · demo</strong><small>{beat >= 3 ? 'Fullført' : 'En liten aktivitet'}</small></div>
        <div className="mission-value">+20<small>poeng</small></div>
        <motion.div className="mission-progress" animate={{ scaleX: beat >= 3 ? 1 : beat >= 2 ? .65 : .08 }} transition={{ duration: .6 }} />
      </div>
      <motion.div className="xp-pill" animate={{ opacity: beat >= 3 ? 1 : .35, scale: beat >= 3 ? 1 : .85 }}><Sparkles /> +5 XP</motion.div>
    </motion.div>
    <motion.div className="balance-carrier" animate={{ scale: beat >= 6 ? 3 : 1, x: beat >= 6 ? '-25vw' : 0, y: beat >= 6 ? '8vh' : 0 }} transition={{ duration: .7 }}><Coin /></motion.div>
    <Caption delay={3}>Samle poeng fra<br />demoaktiviteter.</Caption>
  </Frame>;
}
