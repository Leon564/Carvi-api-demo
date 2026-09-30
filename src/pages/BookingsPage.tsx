import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBookings } from '../api/hooks';
import { BOOKING_STATUSES, type BookingStatus } from '../api/types';
import { BookingDetailDrawer } from '../components/booking/BookingDetailDrawer';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { Badge, Button, EmptyState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { money, paymentStatusLabel, STATUS_LABELS } from '../lib/format';
import { notifyError } from '../lib/notify';

export function BookingsPage() {
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  // The open booking lives in the URL so other screens can link to it (/reservas?id=…).
  const [params, setParams] = useSearchParams();
  const selected = params.get('id');
  const setSelected = (id: string | null) => setParams(id ? { id } : {}, { replace: true });
  const bookings = useBookings({ page, limit: 20, status: status || undefined, from: from || undefined, to: to || undefined });
  useEffect(() => {
    if (bookings.error) notifyError(bookings.error);
  }, [bookings.error]);
  return (
    <>
      <PageTitle title="Reservas" subtitle="Las reservas que has creado, de la más reciente a la más antigua." />
      <p className="-mt-4 mb-4 text-xs text-slate-400">GET /bookings</p>
      <div className="mb-4 grid max-w-3xl grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
        <Field label="Estado">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as BookingStatus | ''); setPage(1); }}>
            <option value="">Todos</option>
            {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
        </Field>
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
        <Button variant="secondary" onClick={() => { setStatus(''); setFrom(''); setTo(''); setPage(1); }}>Limpiar</Button>
      </div>
      {bookings.isPending && <Spinner />}
      {bookings.data && bookings.data.data.length === 0 && <EmptyState>No hay reservas con esos filtros.</EmptyState>}
      {bookings.data && bookings.data.data.length > 0 && (
        <>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-2">Código</th><th>Estado</th><th>Vehículo</th><th>Cliente</th><th>Fechas</th><th className="text-right">Pagas a Carvi</th><th>Pago</th><th>Creada</th></tr>
            </thead>
            <tbody>
              {bookings.data.data.map((b) => (
                <tr key={b.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setSelected(b.id)}>
                  <td className="py-2 font-mono">{b.confirmationCode}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>{b.vehicle.brand} {b.vehicle.model}</td>
                  <td>{b.customer.fullName}</td>
                  <td>{fmtDate(b.period.from)} → {fmtDate(b.period.to)}</td>
                  <td className="text-right">{money(b.pricing.amountDue)}</td>
                  <td>{b.payment ? <Badge tone="blue">{paymentStatusLabel(b.payment.status)}</Badge> : <span className="text-slate-400">—</span>}</td>
                  <td className="text-slate-500">{fmtDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={bookings.data.meta} onPage={setPage} />
        </>
      )}
      {selected && <BookingDetailDrawer id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
