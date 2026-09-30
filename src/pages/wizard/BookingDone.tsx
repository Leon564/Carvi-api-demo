import { useState } from 'react';
import type { Booking, CancelResult } from '../../api/types';
import { ApiErrorBox } from '../../components/ApiErrorBox';
import { BookingSummary } from '../../components/booking/BookingSummary';
import { CancelBookingDialog } from '../../components/booking/CancelBookingDialog';
import { MetadataTable } from '../../components/MetadataTable';
import { StatusBadge } from '../../components/StatusBadge';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { mmss, useCountdown } from '../../lib/countdown';
import { money } from '../../lib/format';
import { HOLD_GRACE_SECONDS, isTerminalPayError, needsRequote } from '../../lib/guidance';
import type { BookingFlow } from './useBookingFlow';

const GRACE_SECONDS = HOLD_GRACE_SECONDS;

interface Props {
  booking: Booking;
  cancelKey: string;
  /** True once a payment was attempted for this booking, so the button reads «Reintentar pago». */
  paymentAttempted: boolean;
  flow: BookingFlow;
  onBookingUpdated: (booking: Booking) => void;
  onViewInBookings: () => void;
  onNew: () => void;
  onRequote: () => void;
}

export function BookingDone({ booking, cancelKey, paymentAttempted, flow, onBookingUpdated, onViewInBookings, onNew, onRequote }: Props) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellation, setCancellation] = useState<CancelResult['cancellation'] | null>(null);
  const hold = useCountdown(booking.status === 'HOLD' ? booking.hold?.expiresAt : null);
  const inGrace = hold.expired && hold.secondsSinceExpiry <= GRACE_SECONDS;
  const payError = flow.error?.stage === 'pay' ? flow.error.error : null;
  const busy = flow.phase !== 'idle';
  const isHold = booking.status === 'HOLD';
  const holdExpired = payError?.code === 'HOLD_EXPIRED';
  // Past the grace window Carvi always answers HOLD_EXPIRED, so paying is no longer offered.
  const holdOver = isHold && (holdExpired || !booking.hold || (hold.expired && !inGrace));
  const canPay = isHold && !holdOver;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card className="space-y-4">
        <div className="text-center">
          <div className="text-sm text-slate-500">Código de confirmación</div>
          <div className="my-1 font-mono text-4xl font-bold tracking-wider text-carvi">{booking.confirmationCode}</div>
          <div className="flex justify-center gap-2"><StatusBadge status={booking.status} /></div>
          {isHold && (
            <div className="mt-2 text-sm">
              {!hold.expired && <Badge tone="amber">En espera de pago · vence en {mmss(hold.secondsLeft)}</Badge>}
              {inGrace && <Badge tone="amber">Plazo vencido · aún puedes pagar durante {mmss(GRACE_SECONDS - hold.secondsSinceExpiry)} si el vehículo sigue libre</Badge>}
              {hold.expired && !inGrace && <Badge tone="red">La reserva en espera venció</Badge>}
            </div>
          )}
        </div>

        {payError && (
          <ApiErrorBox error={payError}>
            {canPay && !needsRequote(payError.code) && !isTerminalPayError(payError.code) && <Button onClick={flow.pay} disabled={busy}>Reintentar pago</Button>}
            {needsRequote(payError.code) && <Button onClick={onRequote}>Volver a cotizar</Button>}
            {isTerminalPayError(payError.code) && <Button onClick={onNew}>Nueva reserva</Button>}
          </ApiErrorBox>
        )}
        {payError && canPay && <p className="text-xs text-slate-500">La reserva está creada y sigue en espera de pago; el reintento usa la misma clave de idempotencia y no duplica el cobro.</p>}
        {holdOver && !payError && (
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">La reserva en espera venció y ya no se puede pagar. Empieza una reserva nueva.</p>
        )}
        {flow.phase === 'paying' && <Spinner label="Registrando pago…" />}
        {cancellation && (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            Reserva cancelada. Reembolsa a tu cliente <strong>{money(cancellation.refundableAmount)} {cancellation.currency}</strong>.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canPay && !payError && <Button onClick={flow.pay} disabled={busy}>{paymentAttempted ? 'Reintentar pago' : 'Confirmar pago'}</Button>}
          {(isHold || booking.status === 'CONFIRMED') && <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={busy}>Cancelar</Button>}
          <Button variant="secondary" onClick={onViewInBookings}>Ver en Reservas</Button>
          <Button variant="secondary" onClick={onNew}>Nueva reserva</Button>
        </div>
        <p className="text-xs text-slate-400">POST /bookings/{'{id}'}/confirm · POST /bookings/{'{id}'}/cancel</p>
      </Card>

      <div className="space-y-4">
        <Card>
          <BookingSummary booking={booking} showHeader={false} />
        </Card>
        <Card>
          <h3 className="mb-2 font-semibold">Datos adicionales</h3>
          <p className="mb-2 text-xs text-slate-500">Tal como los devolvió Carvi.</p>
          <MetadataTable metadata={booking.metadata} />
        </Card>
      </div>

      <CancelBookingDialog
        booking={booking}
        idempotencyKey={cancelKey}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(result) => {
          setCancellation(result.cancellation);
          flow.clearError();
          onBookingUpdated(result.booking);
        }}
      />
    </div>
  );
}
