import { Link } from 'wouter';
import { Compass } from 'lucide-react';
import { Logo } from '@/components/bp';

export default function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-6 text-center">
      <div>
        <Logo className="mb-8" />
        <div className="btn-electric animate-floaty mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl"><Compass className="h-9 w-9" /></div>
        <h1 className="font-display text-3xl">Fant ikke siden</h1>
        <p className="mt-2 text-muted-foreground">Lenken finnes ikke, eller siden er flyttet.</p>
        <Link href="/" className="bp-btn btn-gold mt-6 h-11 px-6 text-sm" data-testid="link-home">Til forsiden</Link>
      </div>
    </div>
  );
}
