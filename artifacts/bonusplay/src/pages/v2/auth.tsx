import { SignIn, SignUp } from '@clerk/react';
import { basePath } from './shared';

export function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/account`} />
    </div>
  );
}
export function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/account`} />
    </div>
  );
}
