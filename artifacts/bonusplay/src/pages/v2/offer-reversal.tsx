import { useRef, useState, type FormEvent } from 'react';
import { useReverseV2Conversion, type V2Conversion } from '@workspace/api-client-react';
import { Btn } from '@/components/bp';
import { errMsg } from '@/hooks/use-bp';
import { fmtDate } from './shared';

const nf = new Intl.NumberFormat('nb-NO');

export function ReversalHistory({ conversion, admin = false }: { conversion: V2Conversion; admin?: boolean }) {
  if (!conversion.reversalEvents.length) return null;
  return <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm">
    {conversion.reversalEvents.map(e => <div key={e.compensationTransactionId}>
      <p className="font-bold">Tilbakeført: {nf.format(conversion.points)} poeng · {fmtDate(e.createdAt)}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{e.reason}</p>
      <p className="mt-1 text-xs text-muted-foreground">Partnerens opprinnelige bekreftelse er bevart. Tilbakeføringen vises også i poenghistorikken.</p>
      {admin && <p className="mt-2 break-all text-xs text-muted-foreground">Administrator: {e.actorId}<br />Kompensasjon: {e.compensationTransactionId}</p>}
    </div>)}
  </div>;
}

export function ReverseConversionForm({ conversion, onDone }: { conversion: V2Conversion; onDone: () => void }) {
  const reverse = useReverseV2Conversion();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const key = useRef<{ reason: string; value: string } | null>(null);
  const normalized = reason.trim();
  const valid = normalized.length >= 10 && normalized.length <= 500 && confirmed;
  const id = `reverse-${conversion.id}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || reverse.isPending) return;
    if (!key.current || key.current.reason !== normalized) key.current = { reason: normalized, value: crypto.randomUUID() };
    reverse.mutate({ conversionId: conversion.id, data: { reason: normalized, idempotencyKey: key.current.value } },
      { onSuccess: onDone });
  };
  return <details className="mt-3 rounded-xl border border-red-400/20 p-3">
    <summary className="cursor-pointer text-sm font-bold text-red-300">Reverser godkjente poeng</summary>
    <p className="mt-2 text-sm">Hele beløpet på {nf.format(conversion.points)} poeng trekkes tilbake. Partnerbeviset beholdes; en ny kompensasjon og en egen tilbakeføringshendelse lagres.</p>
    <p className="mt-2 text-xs text-muted-foreground">Hvis tilgjengelig saldo ikke dekker beløpet, avvises handlingen uten endringer. Brukte eller reserverte poeng kan ikke gi negativ saldo. Historiske korrigeringer er tillatt selv når ny opptjening er stengt.</p>
    <form onSubmit={submit} className="mt-3 space-y-3">
      <label htmlFor={id} className="block text-sm font-bold">Begrunnelse som vises til brukeren (10–500 tegn)
        <textarea id={id} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={reverse.isPending}
          className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 p-3 font-normal outline-none focus:border-primary"
          data-testid={`input-${id}`} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={reverse.isPending}
          className="mt-1 h-5 w-5 shrink-0" data-testid={`confirm-${id}`} />
        Jeg bekrefter at hele det godkjente beløpet skal tilbakeføres, og at begrunnelsen ikke inneholder sensitive personopplysninger.
      </label>
      <Btn type="submit" size="sm" variant="danger" loading={reverse.isPending} disabled={!valid || reverse.isPending}
        data-testid={`button-${id}`}>Reverser {nf.format(conversion.points)} poeng</Btn>
      {reverse.isError && <p role="alert" className="text-sm text-red-300">{errMsg(reverse.error)} Prøv igjen med samme begrunnelse for å gjenbruke forespørselsnøkkelen.</p>}
    </form>
  </details>;
}
