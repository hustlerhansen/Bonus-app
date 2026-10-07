import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Coins, Gem, Sparkles, Zap } from 'lucide-react';
import type { ClaimResult } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Btn } from '@/components/bp';
import { fmt } from '@/lib/format';

const Ctx = createContext<{ show: (r: ClaimResult) => void }>({ show: () => {} });
export const useReward = () => useContext(Ctx);

export function RewardProvider({ children }: { children: ReactNode }) {
  const [res, setRes] = useState<ClaimResult | null>(null);
  const show = useCallback((r: ClaimResult) => setRes(r), []);
  const value = useMemo(() => ({ show }), [show]);
  const parts = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({ a: (i / 18) * Math.PI * 2, d: 90 + (i % 4) * 28, c: i % 3 })),
    [],
  );
  const cols = ['hsl(45 100% 62%)', 'hsl(217 100% 65%)', 'hsl(275 95% 70%)'];
  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={!!res} onOpenChange={(o) => !o && setRes(null)}>
        <DialogContent className="glass glass-glow max-w-sm overflow-hidden rounded-[2rem] border-0 text-center" data-testid="dialog-reward">
          {res && (
            <div className="relative px-1 py-4">
              <div className="pointer-events-none absolute left-1/2 top-12">
                {parts.map((p, i) => (
                  <motion.span
                    key={i}
                    className="absolute h-2 w-2 rounded-full"
                    style={{ background: cols[p.c] }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d, opacity: 0, scale: 0.3 }}
                    transition={{ duration: 1.1, ease: 'easeOut', delay: 0.05 }}
                  />
                ))}
              </div>
              <div className="btn-gold animate-pop mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl">
                <Sparkles className="h-9 w-9" />
              </div>
              <DialogTitle className="font-display text-xl">Belønning hentet</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">{res.message}</DialogDescription>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <Stat icon={<Coins className="h-4 w-4" />} v={res.pointsEarned} l="poeng" cls="gold-text" />
                <Stat icon={<Zap className="h-4 w-4 text-primary" />} v={res.xpEarned} l="erfaring" cls="grad-text" />
                <Stat icon={<Gem className="h-4 w-4 text-accent" />} v={res.gemsEarned} l="juveler" cls="text-accent" />
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-widest text-muted-foreground">Demo, ingen ekte verdi</p>
              <Btn className="mt-4 w-full" variant="electric" onClick={() => setRes(null)} data-testid="button-reward-close">Fortsett</Btn>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

function Stat({ icon, v, l, cls }: { icon: ReactNode; v: number; l: string; cls: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex justify-center">{icon}</div>
      <div className={`font-display mt-1 text-lg ${cls}`}>+{fmt(v)}</div>
      <div className="text-[11px] text-muted-foreground">{l}</div>
    </div>
  );
}
