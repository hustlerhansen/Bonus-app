import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useUser, UserProfile } from '@clerk/react';
import { dark } from '@clerk/themes';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { getGetV2AccountQueryKey, useEnrollV2Account, useUpdateV2Account, type V2Account, type V2AccountState } from '@workspace/api-client-react';
import { Btn, Card, ErrorState, PageHead, PageSkeleton } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { basePath, fmtDate, PhaseNotice, SignedInOnly, useV2State, V2Frame } from './shared';

const inputCls = 'mt-1 h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm outline-none focus:border-primary';

function Gate({ children }: { children: (s: V2AccountState) => ReactNode }) {
  const q = useV2State();
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <>{children(q.data)}</>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-bold">{label}{children}</label>;
}

function LangSelect({ value, onChange }: { value: 'nb' | 'en'; onChange: (v: 'nb' | 'en') => void }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as 'nb' | 'en')}>
      <option value="nb">Norsk bokmål</option><option value="en">English</option>
    </select>
  );
}

function Enroll({ state }: { state: V2AccountState }) {
  const { user } = useUser();
  const qc = useQueryClient();
  const enroll = useEnrollV2Account();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [lang, setLang] = useState<'nb' | 'en'>('nb');
  const [terms, setTerms] = useState(false);
  const [priv, setPriv] = useState(false);
  const [age, setAge] = useState(false);
  const seeded = useRef(false);
  useEffect(() => {
    if (user && !seeded.current) {
      seeded.current = true;
      setFirst(user.firstName ?? '');
      setLast(user.lastName ?? '');
    }
  }, [user]);
  const valid = first.trim().length > 0 && last.trim().length > 0 && terms && priv && age;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    enroll.mutate(
      { data: { firstName: first.trim(), lastName: last.trim(), country: 'NO', language: lang, termsAccepted: true, privacyAccepted: true, ageConfirmed: true, termsVersion: state.termsVersion, privacyVersion: state.privacyVersion } },
      { onSuccess: (s) => qc.setQueryData(getGetV2AccountQueryKey(), s) },
    );
  };
  const cb = 'mt-0.5 h-5 w-5 shrink-0 accent-[hsl(217,100%,60%)]';
  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHead eyebrow="Registrering" title="Fullfør kontoen din" sub="Bekreft opplysningene og samtykkene under for å aktivere V2-kontoen." />
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fornavn"><input className={inputCls} value={first} maxLength={80} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" data-testid="input-first" /></Field>
          <Field label="Etternavn"><input className={inputCls} value={last} maxLength={80} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" data-testid="input-last" /></Field>
          <Field label="Land"><input className={inputCls + ' opacity-70'} value="Norge" disabled readOnly /></Field>
          <Field label="Språk"><LangSelect value={lang} onChange={setLang} /></Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <label className="flex gap-3 text-sm"><input type="checkbox" className={cb} checked={terms} onChange={(e) => setTerms(e.target.checked)} data-testid="check-terms" />
          <span>Jeg har lest og godtar <Link href="/terms" className="font-bold text-primary underline">vilkårene</Link> (versjon {state.termsVersion}).</span></label>
        <label className="flex gap-3 text-sm"><input type="checkbox" className={cb} checked={priv} onChange={(e) => setPriv(e.target.checked)} data-testid="check-privacy" />
          <span>Jeg har lest og godtar <Link href="/privacy" className="font-bold text-primary underline">personvernerklæringen</Link> (versjon {state.privacyVersion}).</span></label>
        <label className="flex gap-3 text-sm"><input type="checkbox" className={cb} checked={age} onChange={(e) => setAge(e.target.checked)} data-testid="check-age" />
          <span>Jeg bekrefter at jeg er 18 år eller eldre.</span></label>
        <p className="text-xs text-muted-foreground">Vilkår og personvern er utkast for testing og er ikke godkjent som kommersiell juridisk tekst.</p>
      </Card>
      {enroll.isError && <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errMsg(enroll.error)}</div>}
      <Btn type="submit" size="lg" variant="gold" className="w-full" disabled={!valid} loading={enroll.isPending} data-testid="button-enroll">Opprett V2-konto</Btn>
    </form>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-white/5 py-2 text-sm last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="break-all text-right font-bold">{v}</dd></div>;
}

function Dashboard({ a }: { a: V2Account }) {
  return (
    <>
      <PageHead eyebrow="Konto" title={`Hei, ${a.firstName}`} sub="Din verifiserte BONUSPLAY-konto er aktiv." />
      <div className="mb-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Kontoen er registrert. Status: {a.status}</div>
      <PhaseNotice className="mb-4" />
      <Card>
        <dl>
          <Row k="E-post" v={a.email} /><Row k="Navn" v={`${a.firstName} ${a.lastName}`} /><Row k="Land" v="Norge" />
          <Row k="Språk" v={a.language === 'nb' ? 'Norsk bokmål' : 'English'} /><Row k="Rolle" v={a.role} />
          <Row k="Vervekode" v={a.referralCode} /><Row k="E-post bekreftet" v={fmtDate(a.emailVerifiedAt)} />
          <Row k="Vilkår godtatt" v={`${fmtDate(a.termsAcceptedAt)} (v. ${a.termsVersion})`} />
          <Row k="Personvern godtatt" v={`${fmtDate(a.privacyAcceptedAt)} (v. ${a.privacyVersion})`} />
          <Row k="Opprettet" v={fmtDate(a.createdAt)} /><Row k="Sist innlogget" v={fmtDate(a.lastLoginAt)} />
        </dl>
      </Card>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/account/profile"><Btn variant="ghost">Rediger profil</Btn></Link>
        <Link href="/account/security"><Btn variant="ghost">Passord og økter</Btn></Link>
      </div>
    </>
  );
}

export function AccountPage() {
  return (
    <SignedInOnly>
      <V2Frame nav title="Konto" desc="Din verifiserte BONUSPLAY-konto.">
        <Gate>{(s) => (s.account ? <Dashboard a={s.account} /> : <Enroll state={s} />)}</Gate>
      </V2Frame>
    </SignedInOnly>
  );
}

function ProfileForm({ a }: { a: V2Account }) {
  const qc = useQueryClient();
  const upd = useUpdateV2Account();
  const [first, setFirst] = useState(a.firstName);
  const [last, setLast] = useState(a.lastName);
  const [lang, setLang] = useState<'nb' | 'en'>(a.language === 'en' ? 'en' : 'nb');
  const [saved, setSaved] = useState(false);
  const dirty = first !== a.firstName || last !== a.lastName || lang !== a.language;
  const valid = first.trim() && last.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    upd.mutate({ data: { firstName: first.trim(), lastName: last.trim(), country: 'NO', language: lang } },
      { onSuccess: (s) => { qc.setQueryData(getGetV2AccountQueryKey(), s); setSaved(true); } });
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fornavn"><input className={inputCls} value={first} maxLength={80} onChange={(e) => { setFirst(e.target.value); setSaved(false); }} data-testid="input-first" /></Field>
          <Field label="Etternavn"><input className={inputCls} value={last} maxLength={80} onChange={(e) => { setLast(e.target.value); setSaved(false); }} data-testid="input-last" /></Field>
          <Field label="E-post"><input className={inputCls + ' opacity-70'} value={a.email} disabled readOnly /></Field>
          <Field label="Land"><input className={inputCls + ' opacity-70'} value="Norge" disabled readOnly /></Field>
          <Field label="Språk"><LangSelect value={lang} onChange={(v) => { setLang(v); setSaved(false); }} /></Field>
        </div>
      </Card>
      <div aria-live="polite">
        {upd.isError && <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Kunne ikke lagre: {errMsg(upd.error)}</div>}
        {saved && !dirty && <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />Profilen er lagret.</div>}
      </div>
      <Btn type="submit" disabled={!dirty || !valid} loading={upd.isPending} data-testid="button-save-profile">Lagre endringer</Btn>
    </form>
  );
}

export function AccountProfilePage() {
  return (
    <SignedInOnly>
      <V2Frame nav title="Profil" desc="Rediger din BONUSPLAY-profil.">
        <PageHead eyebrow="Konto" title="Profil" sub="E-post og rolle kan ikke endres her." />
        <Gate>{(s) => (s.account ? <ProfileForm key={s.account.id} a={s.account} /> : <Redirect to="/account" />)}</Gate>
      </V2Frame>
    </SignedInOnly>
  );
}

export function AccountSecurityPage() {
  const [location, navigate] = useLocation();
  const { isLoaded, isSignedIn } = useUser();
  const initialized = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || initialized.current) return;
    initialized.current = true;
    // Clerk's root is its profile tab; open the already-tested security sub-route.
    if (location === '/account/security') {
      navigate('/account/security/security', { replace: true });
    }
  }, [isLoaded, isSignedIn, location, navigate]);
  return (
    <SignedInOnly>
      <V2Frame nav title="Sikkerhet" desc="Passord og økter for kontoen din.">
        <PageHead eyebrow="Konto" title="Sikkerhet" sub="Endre passord og administrer aktive økter." />
        <div className="flex justify-center">
          <UserProfile routing="path" path={`${basePath}/account/security`} appearance={{ theme: dark, elements: { rootBox: 'w-full', cardBox: 'w-full max-w-full' } }} />
        </div>
      </V2Frame>
    </SignedInOnly>
  );
}
