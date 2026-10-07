import { type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { usePageMeta } from '@/hooks/use-page-meta';
import { Protected } from '@/components/protected';
import { RewardProvider } from '@/components/reward-modal';
import NotFound from '@/pages/not-found';
import HomePage from '@/pages/home';
import MissionsPage from '@/pages/missions';
import GamesPage from '@/pages/games';
import EventsPage from '@/pages/events';
import LeaderboardPage from '@/pages/leaderboard';
import RewardsPage from '@/pages/rewards';
import WalletPage from '@/pages/wallet';
import ProfilePage from '@/pages/profile';
import AchievementsPage from '@/pages/achievements';
import ReferralsPage from '@/pages/referrals';
import NotificationsPage from '@/pages/notifications';
import SettingsPage from '@/pages/settings';
import AdminPage from '@/pages/admin';
import { HelpPage, PrivacyPage, TermsPage } from '@/pages/legal';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

const META: Record<string, [string, string]> = {
  '/': ['Hjem', 'Din saldo, dagsbelønning og neste oppdrag i BONUSPLAY-demoen.'],
  '/missions': ['Oppdrag', 'Fullfør demooppdrag, undersøkelser og tilbud for poeng og erfaring.'],
  '/games': ['Spill', 'Spill tap, reaksjonstest og memory og hent belønning i demoen.'],
  '/events': ['Arrangementer', 'Samle juveler i Weekend Drop og åpne kister. Kun demo.'],
  '/leaderboard': ['Toppliste', 'Se rangeringen for dag, uke og måned i demoen.'],
  '/rewards': ['Premier', 'Bytt poeng mot demopremier. Ingen ekte utbetalinger.'],
  '/wallet': ['Lommebok', 'Transaksjonshistorikk for poeng og juveler med filtre.'],
  '/profile': ['Profil', 'Din demoprofil, nivå og statistikk.'],
  '/achievements': ['Prestasjoner', 'Se hvilke prestasjoner du har låst opp.'],
  '/referrals': ['Verv venner', 'Del vervelenken din og se aktive vervinger i demoen.'],
  '/notifications': ['Varsler', 'Dine varsler i BONUSPLAY-demoen.'],
  '/settings': ['Innstillinger', 'Tilbakestill demoen, installer appen eller logg ut.'],
  '/admin': ['Admin', 'Administrasjon av demo: kataloger, brytere, brukere og økonomi.'],
  '/help': ['Hjelp', 'Svar på vanlige spørsmål om BONUSPLAY-demoen.'],
  '/privacy': ['Personvern', 'Utkast til personvernerklæring for BONUSPLAY-demoen.'],
  '/terms': ['Vilkår', 'Utkast til bruksvilkår for BONUSPLAY-demoen.'],
};
const guard = (path: string, C: ComponentType, allowAnon = false) => () => {
  const [t, d] = META[path];
  usePageMeta(t, d);
  return <Protected allowAnon={allowAnon}><C /></Protected>;
};
const pages: [string, ComponentType, boolean?][] = [
  ['/', HomePage], ['/missions', MissionsPage], ['/games', GamesPage], ['/events', EventsPage], ['/leaderboard', LeaderboardPage],
  ['/rewards', RewardsPage], ['/wallet', WalletPage], ['/profile', ProfilePage], ['/achievements', AchievementsPage], ['/referrals', ReferralsPage],
  ['/notifications', NotificationsPage], ['/settings', SettingsPage], ['/admin', AdminPage],
  ['/help', HelpPage, true], ['/privacy', PrivacyPage, true], ['/terms', TermsPage, true],
];
const wrapped = pages.map(([p, C, a]) => [p, guard(p, C, a)] as const);

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {wrapped.map(([p, C]) => <Route key={p} path={p} component={C} />)}
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RewardProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </RewardProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
