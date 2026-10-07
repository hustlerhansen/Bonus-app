import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { Caption, Coin, Frame, Headline, useBeat } from '../FilmElements';
export function Scene4() {
  const beat = useBeat([600, 900, 1800, 2300, 2600, 3400, 4100]);
  return <Frame theme="streak-field" number={4}>
    <Headline>KOM TILBAKE.<br /><span>BYGG EN STREAK.</span></Headline>
    <motion.div className="streak-hero" initial={{ scale: 1.12, rotate: 12 }} animate={{ scale: beat >= 7 ? .6 : beat >= 5 ? .72 : 1, rotate: beat >= 7 ? -8 : beat >= 2 ? 8 : 0, y: beat >= 7 ? '-6vh' : beat >= 5 ? '-5vh' : 0 }} transition={{ duration: .8 }}>
      <svg className="streak-ring" viewBox="0 0 200 200">
        {Array.from({ length: 7 }, (_, i) => <motion.circle key={i} cx="100" cy="100" r="88" fill="none" stroke={i === 6 && beat < 4 ? '#342e21' : '#ffd24d'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray="63 490" transform={`rotate(${i * 51.43 - 87} 100 100)`} initial={{ opacity: .25 }} animate={{ opacity: beat >= 1 || i === 0 ? 1 : .25 }} transition={{ delay: i * .07 }} />)}
      </svg>
      <Flame className="streak-flame" /><div className="streak-day">DAG <strong>{beat >= 3 ? 7 : 6}</strong></div>
      <div className="streak-days">1 <span>2</span> 3 <span>4</span> 5 <span>6</span> <b>7</b></div>
    </motion.div>
    <motion.div className="streak-bonus" initial={{ opacity: 0, scale: .8 }} animate={{ opacity: beat >= 5 ? 1 : 0, scale: beat >= 5 ? 1 : .8 }}><strong>+500</strong><span>POENG <i>·</i> +50 XP</span></motion.div>
    {Array.from({ length: 8 }, (_, i) => <motion.div className="bonus-particle" key={i} style={{ left: `${8 + i * 12}%` }} initial={{ y: '58vh', opacity: 0 }} animate={{ y: beat >= 6 ? ['58vh', '45vh', '85vh'] : '58vh', opacity: beat >= 6 ? [0, 1, 0] : 0, rotate: i * 37 }} transition={{ duration: 1.2, delay: i * .035 }}><Coin /></motion.div>)}
    <Caption delay={3.6}>Sju dager.<br />En ekstra bonus.</Caption>
  </Frame>;
}
