import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { animate } from 'framer-motion';
import { AlertTriangle, Coins, Gem, Inbox, Loader2, Lock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmt } from '@/lib/format';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'electric' | 'gold' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  shine?: boolean;
};
export function Btn({ variant = 'electric', size = 'md', loading, icon, shine, className, children, disabled, type = 'button', ...rest }: BtnProps) {
  const sz = size === 'sm' ? 'h-9 px-4 text-xs' : size === 'lg' ? 'h-14 px-8 text-base' : 'h-11 px-6 text-sm';
  return (
    <button type={type} disabled={disabled || loading} className={cn('bp-btn', `btn-${variant}`, sz, shine && 'shine', className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, glow, ...rest }: { className?: string; children: ReactNode; glow?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass rounded-[1.75rem] p-5', glow && 'glass-glow', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHead({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="rise mb-6 flex items-end justify-between gap-4 pt-2">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</div>}
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pts({ value, kind = 'points', sign }: { value: number; kind?: 'points' | 'xp' | 'gems'; sign?: boolean }) {
  const map = {
    points: { i: <Coins className="h-3.5 w-3.5" />, c: 'text-amber-300 bg-amber-400/10 border-amber-300/25', l: 'p' },
    xp: { i: <Zap className="h-3.5 w-3.5" />, c: 'text-sky-300 bg-sky-400/10 border-sky-300/25', l: 'EP' },
    gems: { i: <Gem className="h-3.5 w-3.5" />, c: 'text-fuchsia-300 bg-fuchsia-400/10 border-fuchsia-300/25', l: '' },
  }[kind];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums', map.c)}>
      {map.i}
      {sign && value > 0 ? '+' : ''}
      {fmt(value)} {map.l}
    </span>
  );
}

export function Meter({ value, max, tone = 'electric' }: { value: number; max: number; tone?: 'electric' | 'gold' }) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn('h-full rounded-full transition-[width] duration-700', tone === 'gold' ? 'btn-gold' : 'btn-electric')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  useEffect(() => {
    const c = animate(prev.current, value, {
      duration: 0.9,
      ease: 'easeOut',
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(Math.round(v));
      },
    });
    prev.current = value;
    return () => c.stop();
  }, [value]);
  return <span ref={ref} className={cn('tabular-nums', className)}>{fmt(value)}</span>;
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Card className="mx-auto max-w-md text-center" role="alert">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/15 text-destructive"><AlertTriangle /></div>
      <h3 className="font-display text-lg">Noe gikk galt</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message ?? 'Vi kunne ikke hente data akkurat nå.'}</p>
      {onRetry && <Btn className="mt-4" variant="ghost" onClick={onRetry} data-testid="button-retry">Prøv igjen</Btn>}
    </Card>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[1.75rem] border border-dashed border-white/15 p-8 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-muted-foreground">{icon ?? <Inbox />}</div>
      <h3 className="font-display text-base">{title}</h3>
      {text && <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function FeatureOff({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-200" data-testid="notice-feature-off">
      <Lock className="h-5 w-5 shrink-0" />
      <span><b>{name}</b> er midlertidig slått av av administrator (demo).</span>
    </div>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn('skel', className)} />;
}
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skel className="h-10 w-2/3" />
      <Skel className="h-44 w-full" />
      <div className="grid gap-4 sm:grid-cols-2"><Skel className="h-28" /><Skel className="h-28" /></div>
      <Skel className="h-28 w-full" />
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden>
        <defs>
          <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f7bff" /><stop offset="1" stopColor="#9b4dff" /></linearGradient>
          <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffd24d" /><stop offset="1" stopColor="#ff7a1a" /></linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#lg1)" />
        <path d="M24 9l11 11-11 19L13 20z" fill="url(#lg2)" />
        <path d="M13 20h22L24 9z" fill="#fff" opacity=".35" />
      </svg>
      <span className="font-display text-[15px] font-extrabold tracking-tight">BONUS<span className="gold-text">PLAY</span></span>
    </span>
  );
}
