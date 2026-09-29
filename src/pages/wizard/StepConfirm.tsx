import { placeLabel, type Quote, type Vehicle } from '../../api/types';
import { ApiErrorBox } from '../../components/ApiErrorBox';
import { MetadataTable } from '../../components/MetadataTable';
import { Button, Card, Spinner } from '../../components/ui';
import { useCountdown } from '../../lib/countdown';
import type { PeriodInput } from '../../lib/dates';
import { money } from '../../lib/format';
import { needsRequote } from '../../lib/guidance';
import { rowsToMetadata } from '../../lib/metadata';
import { QuoteSummary } from './QuoteSummary';
import type { BookingFlow } from './useBookingFlow';
import type { CustomerForm } from './wizardState';

interface Props {
  vehicle: Vehicle;
  period: PeriodInput;
  quote: Quote;
  customer: CustomerForm;
  flow: BookingFlow;
  onEdit: () => void;
  onRenewed: (quote: Quote) => void;
  onRequote: () => void;
}

export function StepConfirm({ vehicle, period, quote, customer, flow, onEdit, onRenewed, onRequote }: Props) {
  const quoteCountdown = useCountdown(quote.expiresAt);
  const busy = flow.phase !== 'idle';
  const createError = flow.error?.stage === 'create' ? flow.error.error : null;
  const metadata = rowsToMetadata(customer.metadata).metadata ?? null;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card className="space-y-4">
        <section>
          <h3 className="mb-2 font-semibold">Cliente</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Nombre</dt><dd>{customer.fullName}</dd>
            <dt className="text-slate-500">Correo</dt><dd>{customer.email}</dd>
            <dt className="text-slate-500">Teléfono</dt><dd>{customer.phone}</dd>
            <dt className="text-slate-500">País</dt><dd>{customer.country.toUpperCase()}</dd>
            <dt className="text-slate-500">Entrega</dt><dd>{placeLabel(customer.pickup)}</dd>
            <dt className="text-slate-500">Devolución</dt><dd>{placeLabel(customer.dropoff)}</dd>
            <dt className="text-slate-500">Tu referencia</dt><dd>{customer.externalReference || <span className="text-slate-400">—</span>}</dd>
          </dl>
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Datos adicionales</h3>
          <MetadataTable metadata={metadata} />
        </section>
        <div className="rounded-md bg-sky-50 p-3 text-sm">
          Lo que pagas a Carvi: <strong className="text-lg text-carvi">{money(quote.pricing.amountDue)} {quote.pricing.currency}</strong>
          <p className="mt-1 text-slate-600">
            «Reservar y pagar» crea la reserva y registra un pago simulado por ese importe. «Solo reservar» la deja en espera de pago durante 15 minutos.
          </p>
        </div>

        {createError && (
          <ApiErrorBox error={createError}>
            {needsRequote(createError.code) && <Button onClick={onRequote}>Volver a cotizar</Button>}
            {createError.code === 'CLIENT_DATA_CONFLICT' && <Button variant="secondary" onClick={onEdit}>Modificar datos</Button>}
          </ApiErrorBox>
        )}
        {flow.phase === 'creating' && <Spinner label="Creando reserva…" />}
        {flow.phase === 'paying' && <Spinner label="Registrando pago…" />}

        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="secondary" onClick={onEdit} disabled={busy}>Modificar datos</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={flow.createOnly} disabled={busy || quoteCountdown.expired}>Solo reservar</Button>
            <Button onClick={flow.createAndPay} disabled={busy || quoteCountdown.expired}>Reservar y pagar</Button>
          </div>
        </div>
        {quoteCountdown.expired && <p className="text-right text-xs text-amber-700">La cotización venció: vuelve a cotizar para continuar.</p>}
        <p className="text-xs text-slate-400">POST /bookings · POST /bookings/{'{id}'}/confirm</p>
      </Card>
      <QuoteSummary vehicle={vehicle} period={period} quote={quote} onRenewed={onRenewed} />
    </div>
  );
}
