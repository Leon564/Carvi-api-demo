import { X } from 'lucide-react';
import { useState } from 'react';
import { useBooking } from '../../api/hooks';
import { newIdempotencyKey } from '../../lib/idempotency';
import { ApiErrorBox } from '../ApiErrorBox';
import { MetadataTable } from '../MetadataTable';
import { Button, JsonBlock, Spinner } from '../ui';
import { BookingSummary } from './BookingSummary';
import { CancelBookingDialog } from './CancelBookingDialog';
import { ConfirmPaymentDialog } from './ConfirmPaymentDialog';

export function BookingDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const booking = useBooking(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // A new logical operation each time a dialog is opened.
  const [confirmKey, setConfirmKey] = useState(newIdempotencyKey);
  const [cancelKey, setCancelKey] = useState(newIdempotencyKey);
  const data = booking.data;
  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[560px] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="font-semibold">{data ? `Reserva ${data.confirmationCode}` : 'Reserva'}</div>
          <p className="text-xs text-slate-400">GET /bookings/{'{id}'}</p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={16} /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {booking.isPending && <Spinner />}
        {booking.error && <ApiErrorBox error={booking.error} />}
        {data && (
          <>
            <BookingSummary booking={data} />
            <section>
              <h3 className="mb-2 text-sm font-semibold">Datos adicionales</h3>
              <MetadataTable metadata={data.metadata} />
            </section>
            <div className="flex flex-wrap gap-2">
              {data.status === 'HOLD' && <Button onClick={() => { setConfirmKey(newIdempotencyKey()); setConfirmOpen(true); }}>Confirmar pago</Button>}
              {(data.status === 'HOLD' || data.status === 'CONFIRMED') && (
                <Button variant="danger" onClick={() => { setCancelKey(newIdempotencyKey()); setCancelOpen(true); }}>Cancelar</Button>
              )}
              <Button variant="secondary" onClick={() => booking.refetch()} disabled={booking.isFetching}>Actualizar</Button>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600 hover:text-slate-900">Ver respuesta JSON</summary>
              <JsonBlock value={data} className="mt-2" />
            </details>
            <ConfirmPaymentDialog booking={data} idempotencyKey={confirmKey} open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirmed={() => undefined} />
            <CancelBookingDialog booking={data} idempotencyKey={cancelKey} open={cancelOpen} onClose={() => setCancelOpen(false)} onCancelled={() => undefined} />
          </>
        )}
      </div>
    </aside>
  );
}
