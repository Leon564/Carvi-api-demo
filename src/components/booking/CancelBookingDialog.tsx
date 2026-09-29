import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCancelBooking } from '../../api/hooks';
import type { Booking, CancelResult } from '../../api/types';
import { fmtDate } from '../../lib/dates';
import { money } from '../../lib/format';
import { ApiErrorBox } from '../ApiErrorBox';
import { Button, Field, Input, Modal } from '../ui';

interface Props {
  booking: Booking;
  idempotencyKey: string;
  open: boolean;
  onClose: () => void;
  onCancelled: (result: CancelResult) => void;
}

/** Carvi's policy: full refund of amountDue until 24 h before the start (El Salvador time, UTC-6), nothing after. */
function estimatedRefund(booking: Booking): number {
  if (booking.status !== 'CONFIRMED') return 0;
  const start = new Date(`${booking.period.from}T${booking.period.startTime}:00-06:00`).getTime();
  return start - Date.now() >= 24 * 3600 * 1000 ? booking.pricing.amountDue : 0;
}

export function CancelBookingDialog({ booking, idempotencyKey, open, onClose, onCancelled }: Props) {
  const cancel = useCancelBooking();
  const [reason, setReason] = useState('');
  const { reset } = cancel;
  useEffect(() => {
    if (open) {
      setReason('');
      reset();
    }
  }, [open, reset]);
  const submit = async () => {
    try {
      const result = await cancel.mutateAsync({ id: booking.id, reason: reason.trim() || undefined, idempotencyKey });
      toast.success(`Reserva cancelada · reembolsa a tu cliente ${money(result.cancellation.refundableAmount)}`);
      onCancelled(result);
      onClose();
    } catch {
      // Shown inline below.
    }
  };
  return (
    <Modal open={open} title={`Cancelar ${booking.confirmationCode}`} onClose={onClose}>
      <div className="mb-3 space-y-2 text-sm text-slate-600">
        {booking.status === 'HOLD' ? (
          <p>La reserva todavía no está pagada, así que no hay nada que reembolsar.</p>
        ) : (
          <p>
            Si cancelas hasta 24 horas antes del inicio ({fmtDate(booking.period.from)} {booking.period.startTime}) se reembolsa todo lo pagado a Carvi; después, nada.
            Carvi no devuelve dinero directamente: tú reembolsas a tu cliente el importe que indique la respuesta.
          </p>
        )}
        {open && (
          <p className="rounded-md bg-slate-50 p-3">
            Reembolsable estimado a tu cliente: <strong>{money(estimatedRefund(booking))} {booking.pricing.currency}</strong>
          </p>
        )}
      </div>
      <Field label="Motivo (opcional)">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="p. ej. el cliente cambió de planes" />
      </Field>
      {cancel.error && <ApiErrorBox error={cancel.error} className="mt-3" />}
      <p className="mt-3 text-xs text-slate-400">POST /bookings/{'{id}'}/cancel</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button variant="danger" onClick={submit} disabled={cancel.isPending}>{cancel.isPending ? 'Cancelando…' : 'Cancelar reserva'}</Button>
      </div>
    </Modal>
  );
}
