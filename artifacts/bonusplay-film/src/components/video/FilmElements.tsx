import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer } from '@/lib/video';

export const EASE = [0.22, 1, 0.36, 1] as const;
export function useBeat(times: number[]) {
  const [beat, setBeat] = useState(0);
  useSceneTimer(times.map((time, i) => ({ time, callback: () => setBeat(i + 1) })));
  return beat;
}
export function useCounter(from: number, to: number, start: number, duration: number) {
  const [value, setValue] = useState(from);
  const steps = Math.ceil(duration / 40);
  useSceneTimer(Array.from({ length: steps + 1 }, (_, i) => ({
    time: start + i * 40,
    callback: () => setValue(Math.round(from + (to - from) * Math.min(1, i / steps))),
  })));
  return value.toLocaleString('nb-NO');
}
export function Frame({ children, theme, number }: { children: ReactNode; theme: string; number: number }) {
  return <motion.section className={`film-scene ${theme}`} data-scene={number}
    initial={{ clipPath: number === 1 ? 'circle(150% at 50% 50%)' : 'circle(32% at 50% 50%)' }}
    animate={{ clipPath: 'circle(150% at 50% 50%)' }}
    exit={{ opacity: 0, scale: 1.07, clipPath: 'polygon(0% 0%, 100% 0%, 76% 100%, 24% 100%)' }}
    transition={{ duration: .55, ease: EASE }}>
    <motion.div className="camera" initial={{ scale: 1, rotate: -.3 }} animate={{ scale: 1.025, rotate: .3 }} transition={{ duration: 5, ease: 'linear' }}>
      {children}
    </motion.div>
    <div className="demo-footer">DEMO <span>·</span> 18+</div>
    <div className="shot-label">BONUSPLAY / 0{number}</div>
  </motion.section>;
}
export function Diamond({ className = '' }: { className?: string }) {
  return <img className={`brand-diamond ${className}`} src={`${import.meta.env.BASE_URL}images/bonusplay.svg`} alt="" />;
}
export function Coin({ className = '' }: { className?: string }) {
  return <div className={`coin ${className}`}><span>✦</span></div>;
}
export function Caption({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return <motion.p className="film-caption" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: .35 }}>{children}</motion.p>;
}
export function Headline({ children }: { children: ReactNode }) {
  return <motion.h2 className="film-headline" initial={{ y: 12, opacity: .7 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: .35 }}>{children}</motion.h2>;
}
