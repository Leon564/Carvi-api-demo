import { useState } from 'react';
import { toast } from 'sonner';
import { useCancelBooking } from '../../api/hooks';
import { cancelBooking } from '../../api/requests';
import type { Booking, CancelResult } from '../../api/types';
import { money } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { Button, Field, Input, Modal } from '../ui';
import type { LastOperation } from './types';

interface Props {
  booking: Booking;
  idempotencyKey: string;
  open: boolean;
  onClose: () => void;
  onCancelled: (result: CancelResult) => void;
  onExecuted?: (op: LastOperation) => void;
}

export function CancelBookingDialog({ booking, idempotencyKey, open, onClose, onCancelled, onExecuted }: Props) {
  const cancel = useCancelBooking();
  const [reason, setReason] = useState('');
  const submit = async () => {
    const trimmed = reason.trim() || undefined;
    onExecuted?.({ label: `POST /bookings/${booking.id}/cancel`, run: () => cancelBooking(booking.id, trimmed, idempotencyKey) });
    try {
      const result = await cancel.mutateAsync({ id: booking.id, reason: trimmed, idempotencyKey });
      toast.success(`Cancelada · reembolsable a tu cliente: ${money(result.cancellation.refundableAmount)} (${result.cancellation.policy})`);
      onCancelled(result);
      onClose();
    } catch (err) {
      notifyError(err);
    }
  };
  return (
    <Modal open={open} title={`Cancelar ${booking.confirmationCode}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Política <code>FULL_UNTIL_24H_BEFORE_START</code>: 100 % de <code>amountDue</code> reembolsable hasta 24 h antes del inicio, 0 % después; un HOLD cancela con 0. Carvi no mueve dinero del canal: la respuesta trae <code>cancellation.refundableAmount</code> para que reembolses a tu cliente.
      </p>
      <Field label="Motivo (opcional, máx. 500)"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      <p className="mt-3 text-xs text-slate-500">Idempotency-Key: <code>{idempotencyKey}</code></p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button variant="danger" onClick={submit} disabled={cancel.isPending}>Cancelar reserva</Button>
      </div>
    </Modal>
  );
}
