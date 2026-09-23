import { X } from 'lucide-react';
import { useState } from 'react';
import { CarviApiError } from '../../api/client';
import { useBooking } from '../../api/hooks';
import { newIdempotencyKey } from '../../lib/idempotency';
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
  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[560px] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="font-semibold">GET /bookings/{id}</div>
        <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={16} /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {booking.isPending && <Spinner />}
        {booking.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {booking.error instanceof CarviApiError ? `${booking.error.code} · ${booking.error.message}` : String(booking.error)}
          </div>
        )}
        {booking.data && (
          <>
            <BookingSummary booking={booking.data} />
            <div className="flex flex-wrap gap-2">
              {booking.data.status === 'HOLD' && <Button onClick={() => { setConfirmKey(newIdempotencyKey()); setConfirmOpen(true); }}>Confirmar (pago simulado)</Button>}
              {(booking.data.status === 'HOLD' || booking.data.status === 'CONFIRMED') && (
                <Button variant="danger" onClick={() => { setCancelKey(newIdempotencyKey()); setCancelOpen(true); }}>Cancelar</Button>
              )}
              <Button variant="secondary" onClick={() => booking.refetch()}>Recargar</Button>
            </div>
            <JsonBlock value={booking.data} />
            <ConfirmPaymentDialog booking={booking.data} idempotencyKey={confirmKey} open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirmed={() => undefined} />
            <CancelBookingDialog booking={booking.data} idempotencyKey={cancelKey} open={cancelOpen} onClose={() => setCancelOpen(false)} onCancelled={() => undefined} />
          </>
        )}
      </div>
    </aside>
  );
}
