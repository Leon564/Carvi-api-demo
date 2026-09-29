import { useCreateQuote } from '../../api/hooks';
import type { Quote, Vehicle } from '../../api/types';
import { ApiErrorBox } from '../../components/ApiErrorBox';
import { Badge, Button, Card } from '../../components/ui';
import { mmss, useCountdown } from '../../lib/countdown';
import { calendarDaysInclusive, fmtDate, type PeriodInput } from '../../lib/dates';
import { PricingTable } from './PricingTable';

interface Props {
  vehicle: Vehicle;
  period: PeriodInput;
  quote: Quote;
  onRenewed: (quote: Quote) => void;
}

/** Vehicle, dates and price of the current quote, with its validity and a way to renew it. */
export function QuoteSummary({ vehicle, period, quote, onRenewed }: Props) {
  const renew = useCreateQuote();
  const countdown = useCountdown(quote.expiresAt);
  return (
    <Card>
      <div className="mb-3 flex gap-3">
        <img src={vehicle.images.main} alt="" className="h-16 w-24 shrink-0 rounded object-cover" />
        <div className="min-w-0">
          <div className="font-semibold">{vehicle.brand} {vehicle.model} {vehicle.year}</div>
          <div className="text-sm text-slate-500">
            {fmtDate(period.from)} {period.startTime} → {fmtDate(period.to)} {period.endTime} · {calendarDaysInclusive(period.from, period.to)} días
          </div>
        </div>
      </div>
      <PricingTable pricing={quote.pricing} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        {countdown.expired ? <Badge tone="red">Cotización vencida</Badge> : <Badge tone="amber">Cotización válida {mmss(countdown.secondsLeft)}</Badge>}
        {countdown.expired && (
          <Button onClick={() => renew.mutate({ vehicleId: vehicle.id, ...period }, { onSuccess: onRenewed })} disabled={renew.isPending}>
            {renew.isPending ? 'Cotizando…' : 'Volver a cotizar'}
          </Button>
        )}
      </div>
      {renew.error && <ApiErrorBox error={renew.error} className="mt-3" />}
      <p className="mt-3 text-xs text-slate-400">POST /quotes</p>
    </Card>
  );
}
