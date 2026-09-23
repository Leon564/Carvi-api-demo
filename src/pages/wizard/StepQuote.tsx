import { useEffect, useRef } from 'react';
import { useCreateQuote } from '../../api/hooks';
import type { Quote, Vehicle } from '../../api/types';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { mmss, useCountdown } from '../../lib/countdown';
import { fmtDate, type PeriodInput } from '../../lib/dates';
import { notifyError } from '../../lib/notify';
import { PricingTable } from './PricingTable';

interface Props {
  vehicle: Vehicle;
  period: PeriodInput;
  quote: Quote | null;
  onQuote: (quote: Quote) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepQuote({ vehicle, period, quote, onQuote, onBack, onNext }: Props) {
  const create = useCreateQuote();
  const countdown = useCountdown(quote?.expiresAt);
  const requested = useRef(false);
  const request = () =>
    create.mutate({ vehicleId: vehicle.id, ...period }, { onSuccess: onQuote, onError: notifyError });
  useEffect(() => {
    if (!quote && !requested.current) {
      requested.current = true;
      request();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card className="max-w-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{vehicle.brand} {vehicle.model} {vehicle.year}</div>
          <div className="text-sm text-slate-500">{fmtDate(period.from)} {period.startTime} → {fmtDate(period.to)} {period.endTime}</div>
        </div>
        <Button variant="secondary" onClick={onBack}>Cambiar vehículo</Button>
      </div>
      <p className="mb-3 text-sm text-slate-600"><code>POST /quotes</code> no bloquea el vehículo ni comprueba disponibilidad; la cotización vence a los 15 minutos y no se consume al reservar.</p>
      {create.isPending && <Spinner label="Cotizando…" />}
      {create.error && !quote && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {create.error.code} · {create.error.message}
          {create.error.code === 'VALIDATION_ERROR' && <p className="mt-1">Vuelve al periodo y elige un rango de al menos 5 días.</p>}
          <div className="mt-2 flex gap-2"><Button variant="secondary" onClick={onBack}>Volver</Button><Button onClick={request}>Reintentar</Button></div>
        </div>
      )}
      {quote && (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Badge>quoteId: {quote.quoteId}</Badge>
            {countdown.expired ? <Badge tone="red">Cotización vencida</Badge> : <Badge tone="amber">Vence en {mmss(countdown.secondsLeft)}</Badge>}
          </div>
          <PricingTable pricing={quote.pricing} />
          <div className="mt-4 flex justify-end gap-2">
            {countdown.expired ? <Button onClick={request}>Volver a cotizar</Button> : <Button onClick={onNext}>Continuar con el cliente</Button>}
          </div>
        </>
      )}
    </Card>
  );
}
