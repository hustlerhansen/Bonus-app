import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Bell, CalendarDays, Coins, Gamepad2, Gift, HelpCircle, Home, LayoutGrid, Medal, MoreHorizontal, Settings, Shield, ShieldCheck,
  Target, Trophy, UserCircle, Users, Wallet, FileText,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Logo } from '@/components/bp';
import { useBpState } from '@/hooks/use-bp';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';

const main = [
  { href: '/', label: 'Hjem', icon: Home },
  { href: '/missions', label: 'Oppdrag', icon: Target },
  { href: '/games', label: 'Spill', icon: Gamepad2 },
  { href: '/rewards', label: 'Premier', icon: Gift },
  { href: '/wallet', label: 'Lommebok', icon: Wallet },
];
const tabs = [
  { href: '/', label: 'HJEM', icon: Home },
  { href: '/missions', label: 'OPPGAVER', icon: Target },
  { href: '/games', label: 'SPILL', icon: Gamepad2 },
  { href: '/events', label: 'KONKURRANSER', icon: CalendarDays },
  { href: '/rewards', label: 'BELØNNINGER', icon: Gift },
];
const more = [
  { href: '/events', label: 'Konkurranser', icon: CalendarDays },
  { href: '/leaderboard', label: 'Toppliste', icon: Trophy },
  { href: '/achievements', label: 'Prestasjoner', icon: Medal },
  { href: '/referrals', label: 'Verv venner', icon: Users },
  { href: '/notifications', label: 'Varsler', icon: Bell },
  { href: '/profile', label: 'Profil', icon: UserCircle },
  { href: '/settings', label: 'Innstillinger', icon: Settings },
  { href: '/help', label: 'Hjelp', icon: HelpCircle },
  { href: '/privacy', label: 'Personvern', icon: ShieldCheck },
  { href: '/terms', label: 'Vilkår', icon: FileText },
];

function active(loc: string, href: string) {
  return href === '/' ? loc === '/' : loc.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
  const s = useBpState();
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const unread = s.notifications.filter((n) => !n.read).length;
  const isAdmin = s.user.role === 'admin';
  const all = [...main, ...more, ...(isAdmin ? [{ href: '/admin', label: 'Admin (demo)', icon: Shield }] : [])];

  return (
    <div className="min-h-[100dvh]">
      <div role="note" className="relative z-40 bg-amber-400 px-4 py-1.5 text-center text-xs font-bold text-[hsl(228_60%_8%)] lg:pl-64" data-testid="banner-test-version">
        TESTVERSJON – kun for inviterte testere. Poeng og premier her har ingen verdi og kan ikke løses inn.
      </div>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/5 bg-[hsl(229_62%_5%/.8)] p-5 backdrop-blur-xl lg:flex">
        <Link href="/" className="mb-8 block" data-testid="link-logo"><Logo /></Link>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {all.map((n) => (
            <Link key={n.href} href={n.href} data-testid={`link-nav-${n.href.slice(1) || 'home'}`}
              className={cn('flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground',
                active(loc, n.href) && 'bg-gradient-to-r from-primary/25 to-accent/20 text-foreground shadow-[inset_0_0_0_1px_hsl(217_100%_65%/.3)]')}>
              <n.icon className="h-[18px] w-[18px]" />
              {n.label}
              {n.href === '/notifications' && unread > 0 && <span className="ml-auto rounded-full bg-accent px-2 text-[11px] font-bold">{unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-[11px] leading-snug text-muted-foreground">
          DEMO: Ingen ekte penger, utbetalinger eller eksterne leverandører.
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[hsl(228_60%_6%/.7)] backdrop-blur-xl">
          <div className="bg-gradient-to-r from-primary/20 via-accent/25 to-amber-400/20 py-1 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/80">
            Demo, ingen ekte utbetalinger
          </div>
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
            <Link href="/" className="lg:hidden"><Logo /></Link>
            <div className="hidden text-sm text-muted-foreground lg:block">Hei, <b className="text-foreground">{s.user.displayName}</b></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setOpen(true)} aria-label="Mer" data-testid="button-more" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 lg:hidden"><MoreHorizontal className="h-[18px] w-[18px]" /></button>
              <Link href="/wallet" data-testid="link-balance" className="flex items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-200">
                <Coins className="h-4 w-4" /><span className="tabular-nums" data-testid="text-balance">{fmt(s.user.points)}</span>
              </Link>
              <Link href="/notifications" aria-label="Varsler" data-testid="link-notifications" className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5">
                <Bell className="h-[18px] w-[18px]" />
                {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />}
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-32 pt-5 lg:pb-12">{children}</main>
      </div>

      <nav className="safe-bottom fixed inset-x-3 bottom-3 z-30 lg:hidden" aria-label="Hovednavigasjon">
        <div className="glass flex items-center justify-between rounded-full px-2 py-1.5 shadow-2xl">
          {tabs.map((n) => {
            const on = active(loc, n.href);
            return (
              <Link key={n.href} href={n.href} data-testid={`link-tab-${n.href.slice(1) || 'home'}`}
                className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[9px] font-semibold transition', on ? 'btn-electric' : 'text-muted-foreground')}>
                <n.icon className="h-[18px] w-[18px]" />{n.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="glass rounded-t-[2rem] border-white/10 pb-8">
          <SheetTitle className="font-display flex items-center gap-2"><LayoutGrid className="h-4 w-4" />Mer</SheetTitle>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[{ href: '/wallet', label: 'Lommebok', icon: Wallet }, ...more, ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : [])].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} data-testid={`link-more-${n.href.slice(1)}`}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-xs font-medium">
                <n.icon className="h-5 w-5 text-primary" />{n.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
