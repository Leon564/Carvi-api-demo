import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmBooking } from '../../api/hooks';
import type { Booking } from '../../api/types';
import { money } from '../../lib/format';
import { isTerminalPayError } from '../../lib/guidance';
import { newExternalPaymentId } from '../../lib/idempotency';
import { ApiErrorBox } from '../ApiErrorBox';
import { Button, Field, Input, Modal } from '../ui';

interface Props {
  booking: Booking;
  idempotencyKey: string;
  open: boolean;
  onClose: () => void;
  onConfirmed: (booking: Booking) => void;
}

export function ConfirmPaymentDialog({ booking, idempotencyKey, open, onClose, onConfirmed }: Props) {
  const confirm = useConfirmBooking();
  const [externalPaymentId, setExternalPaymentId] = useState(newExternalPaymentId);
  const { reset } = confirm;
  useEffect(() => {
    if (open) {
      setExternalPaymentId(newExternalPaymentId());
      reset();
    }
  }, [open, reset]);

  const submit = async () => {
    try {
      const confirmed = await confirm.mutateAsync({
        id: booking.id,
        payment: { externalPaymentId: externalPaymentId.trim(), amount: booking.pricing.amountDue, currency: 'USD' },
        idempotencyKey,
      });
      toast.success(`Reserva ${confirmed.confirmationCode} confirmada`);
      onConfirmed(confirmed);
      onClose();
    } catch {
      // Shown inline below.
    }
  };

  return (
    <Modal open={open} title={`Confirmar pago de ${booking.confirmationCode}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Ya cobraste a tu cliente por tu cuenta; aquí registras ese cobro para que Carvi confirme la reserva.
      </p>
      <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm">
        Importe que se registra: <strong className="text-carvi">{money(booking.pricing.amountDue)} {booking.pricing.currency}</strong>
        <span className="ml-1 text-slate-500">(lo que pagas a Carvi)</span>
      </div>
      <Field label="Referencia de tu cobro" hint="Pago simulado: puedes dejar la referencia generada.">
        <Input value={externalPaymentId} onChange={(e) => setExternalPaymentId(e.target.value)} maxLength={128} />
      </Field>
      {confirm.error && <ApiErrorBox error={confirm.error} className="mt-3" />}
      <p className="mt-3 text-xs text-slate-400">POST /bookings/{'{id}'}/confirm</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button onClick={submit} disabled={confirm.isPending || !externalPaymentId.trim() || isTerminalPayError(confirm.error?.code)}>{confirm.isPending ? 'Confirmando…' : 'Confirmar pago'}</Button>
      </div>
    </Modal>
  );
}
