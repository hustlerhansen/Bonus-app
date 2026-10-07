import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { ClerkProvider, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { V2Landing, BusinessPage } from '@/pages/v2/public';
import { SignInPage, SignUpPage } from '@/pages/v2/auth';
import { AccountPage, AccountProfilePage, AccountSecurityPage } from '@/pages/v2/account';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
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

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: dark,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: `${basePath}/v2`, logoImageUrl: `${window.location.origin}${basePath}/icon.svg` },
  variables: {
    colorPrimary: '#2f7bff', colorForeground: '#f1f4fb', colorMutedForeground: '#a9b2c9', colorDanger: '#f0605d',
    colorBackground: '#10152e', colorInput: '#1a2142', colorInputForeground: '#f1f4fb', colorNeutral: '#8e9bc4',
    fontFamily: "'DM Sans', system-ui, sans-serif", borderRadius: '0.9rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#10152e] border border-white/10 rounded-3xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#f1f4fb] font-bold',
    headerSubtitle: 'text-[#a9b2c9]',
    socialButtonsBlockButtonText: 'text-[#f1f4fb]',
    formFieldLabel: 'text-[#f1f4fb]',
    footerActionLink: 'text-[#6aa3ff] font-bold',
    footerActionText: 'text-[#a9b2c9]',
    dividerText: 'text-[#a9b2c9]',
    identityPreviewEditButton: 'text-[#6aa3ff]',
    formFieldSuccessText: 'text-emerald-300',
    alertText: 'text-[#f1f4fb]',
    formButtonPrimary: 'rounded-full font-bold',
  },
};

const clerkLocalization = {
  signIn: { start: { title: 'Velkommen tilbake', subtitle: 'Logg inn på BONUSPLAY-kontoen din', actionText: 'Ny her?', actionLink: 'Opprett konto' } },
  signUp: { start: { title: 'Opprett BONUSPLAY-konto', subtitle: 'Kun for voksne i Norge (18 år og eldre)', actionText: 'Har du allerede konto?', actionLink: 'Logg inn' } },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const un = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== id) qc.clear();
      prev.current = id;
    });
    return un;
  }, [addListener, qc]);
  return null;
}

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
        <Route path="/v2" component={V2Landing} />
        <Route path="/business" component={BusinessPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/account/profile" component={AccountProfilePage} />
        <Route path="/account/security/*?" component={AccountSecurityPage} />
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

function WithClerk({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={clerkLocalization}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <WithClerk>
        <QueryClientProvider client={queryClient}>
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider>
            <RewardProvider>
              <Router />
            </RewardProvider>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </WithClerk>
    </WouterRouter>
  );
}

export default App;
