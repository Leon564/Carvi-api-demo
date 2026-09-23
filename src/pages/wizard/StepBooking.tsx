import { useState } from 'react';
import { toast } from 'sonner';
import type { Booking, CancelResult, Quote } from '../../api/types';
import { BookingSummary } from '../../components/booking/BookingSummary';
import { CancelBookingDialog } from '../../components/booking/CancelBookingDialog';
import { ConfirmPaymentDialog } from '../../components/booking/ConfirmPaymentDialog';
import type { LastOperation } from '../../components/booking/types';
import { Badge, Button, Card } from '../../components/ui';
import { mmss, useCountdown } from '../../lib/countdown';
import { money } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { PricingTable } from './PricingTable';
import type { WizardKeys } from './wizardState';

const GRACE_SECONDS = 120;

interface Props {
  booking: Booking;
  quote: Quote;
  keys: WizardKeys;
  lastOp: LastOperation | null;
  onExecuted: (op: LastOperation) => void;
  onBookingUpdated: (booking: Booking) => void;
  onNew: () => void;
  onReuseQuote: () => void;
}

export function StepBooking({ booking, quote, keys, lastOp, onExecuted, onBookingUpdated, onNew, onReuseQuote }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellation, setCancellation] = useState<CancelResult['cancellation'] | null>(null);
  const [repeating, setRepeating] = useState(false);
  const hold = useCountdown(booking.status === 'HOLD' ? booking.hold?.expiresAt : null);
  const quoteCountdown = useCountdown(quote.expiresAt);
  const inGrace = hold.expired && hold.secondsSinceExpiry <= GRACE_SECONDS;

  const repeat = async () => {
    if (!lastOp) return;
    setRepeating(true);
    try {
      await lastOp.run();
      toast.info(`Reenviada ${lastOp.label} con la misma Idempotency-Key. Mira Idempotent-Replayed en el panel técnico.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setRepeating(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <BookingSummary booking={booking} />
        {booking.status === 'HOLD' && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            {!hold.expired && <Badge tone="amber">Hold vence en {mmss(hold.secondsLeft)}</Badge>}
            {inGrace && <Badge tone="amber">Hold vencido · gracia de 2 min ({mmss(GRACE_SECONDS - hold.secondsSinceExpiry)}) si el vehículo sigue libre</Badge>}
            {hold.expired && !inGrace && <Badge tone="red">Hold vencido · confirmar responderá 410 HOLD_EXPIRED</Badge>}
          </div>
        )}
        {cancellation && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            Cancelada ({cancellation.reason}). Reembolsable a tu cliente: <strong>{money(cancellation.refundableAmount)} {cancellation.currency}</strong> · política {cancellation.policy}. Carvi no mueve ese dinero.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {booking.status === 'HOLD' && <Button onClick={() => setConfirmOpen(true)}>Cobrar al cliente (simulado) y confirmar</Button>}
          {(booking.status === 'HOLD' || booking.status === 'CONFIRMED') && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancelar</Button>}
          {lastOp && <Button variant="secondary" onClick={repeat} disabled={repeating}>Repetir la última petición ({lastOp.label})</Button>}
          <Button variant="secondary" onClick={onNew}>Nueva reserva</Button>
          {!quoteCountdown.expired && <Button variant="ghost" onClick={onReuseQuote}>Reservar otra vez con la misma cotización</Button>}
        </div>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Cotización usada</h3>
        <PricingTable pricing={booking.pricing} />
        <p className="mt-3 text-xs text-slate-500">quoteId {quote.quoteId} · {quoteCountdown.expired ? 'vencida' : `vence en ${mmss(quoteCountdown.secondsLeft)}`}</p>
      </Card>
      <ConfirmPaymentDialog booking={booking} idempotencyKey={keys.confirm} open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirmed={onBookingUpdated} onExecuted={onExecuted} />
      <CancelBookingDialog
        booking={booking}
        idempotencyKey={keys.cancel}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(result) => {
          setCancellation(result.cancellation);
          onBookingUpdated(result.booking);
        }}
        onExecuted={onExecuted}
      />
    </div>
  );
}
