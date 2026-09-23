import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmBooking } from '../../api/hooks';
import { confirmBooking } from '../../api/requests';
import type { Booking, PaymentInput } from '../../api/types';
import { newExternalPaymentId } from '../../lib/idempotency';
import { money, round2 } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { Button, Field, Input, Modal } from '../ui';
import type { LastOperation } from './types';

interface Props {
  booking: Booking;
  idempotencyKey: string;
  open: boolean;
  onClose: () => void;
  onConfirmed: (booking: Booking) => void;
  onExecuted?: (op: LastOperation) => void;
}

export function ConfirmPaymentDialog({ booking, idempotencyKey, open, onClose, onConfirmed, onExecuted }: Props) {
  const confirm = useConfirmBooking();
  const [externalPaymentId, setExternalPaymentId] = useState(newExternalPaymentId);
  const [wrongAmount, setWrongAmount] = useState(false);
  useEffect(() => {
    if (open) setExternalPaymentId(newExternalPaymentId());
  }, [open]);
  const amount = wrongAmount ? round2(booking.pricing.amountDue - 1) : booking.pricing.amountDue;
  const payment: PaymentInput = { externalPaymentId, amount, currency: 'USD' };

  const submit = async () => {
    onExecuted?.({ label: `POST /bookings/${booking.id}/confirm`, run: () => confirmBooking(booking.id, payment, idempotencyKey) });
    try {
      const confirmed = await confirm.mutateAsync({ id: booking.id, payment, idempotencyKey });
      toast.success(`Reserva ${confirmed.confirmationCode} confirmada`);
      onConfirmed(confirmed);
      onClose();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Modal open={open} title="Cobrar al cliente (simulado)" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        El canal cobra a su cliente por su cuenta y luego confirma con la referencia de ese cobro. Confirmar <strong>no</strong> le cobra nada a Carvi: lo que se le debe se liquida por periodos.
      </p>
      <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm">
        <div>Cobro ficticio al cliente: <strong>{money(booking.pricing.total)}</strong> por la renta.</div>
        <div>Se envía a Carvi <code>payment.amount = {money(amount)}</code> (debe ser exactamente <code>amountDue = {money(booking.pricing.amountDue)}</code>).</div>
      </div>
      <Field label="externalPaymentId · referencia de tu cobro" hint="Repetir la confirmación con el mismo id es seguro; otro id sobre una reserva pagada responde 409.">
        <Input value={externalPaymentId} onChange={(e) => setExternalPaymentId(e.target.value)} maxLength={128} />
      </Field>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wrongAmount} onChange={(e) => setWrongAmount(e.target.checked)} />
        Enviar importe incorrecto (resta 1.00) para ver el <code>400 VALIDATION_ERROR</code> con <code>details.expected/received</code>
      </label>
      <p className="mt-3 text-xs text-slate-500">Idempotency-Key: <code>{idempotencyKey}</code></p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button onClick={submit} disabled={confirm.isPending || !externalPaymentId}>Confirmar reserva</Button>
      </div>
    </Modal>
  );
}
