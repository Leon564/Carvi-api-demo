import type { Booking } from '../../api/types';
import { placeLabel } from '../../api/types';
import { fmtDate, fmtDateTime } from '../../lib/dates';
import { money } from '../../lib/format';
import { StatusBadge } from '../StatusBadge';
import { Badge } from '../ui';

export function BookingSummary({ booking, showHeader = true }: { booking: Booking; showHeader?: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      {showHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-semibold">{booking.confirmationCode}</span>
          <StatusBadge status={booking.status} />
          {booking.externalReference && <Badge>tu ref. {booking.externalReference}</Badge>}
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-slate-500">Vehículo</dt><dd>{booking.vehicle.brand} {booking.vehicle.model} {booking.vehicle.year}</dd>
        <dt className="text-slate-500">Fechas</dt><dd>{fmtDate(booking.period.from)} {booking.period.startTime} → {fmtDate(booking.period.to)} {booking.period.endTime}</dd>
        <dt className="text-slate-500">Cliente</dt><dd>{booking.customer.fullName} · {booking.customer.email} · {booking.customer.phone} · {booking.customer.country}</dd>
        <dt className="text-slate-500">Entrega / devolución</dt><dd>{placeLabel(booking.pickup.location)} → {placeLabel(booking.dropoff.location)}</dd>
        <dt className="text-slate-500">Total de la renta</dt><dd>{money(booking.pricing.total)} {booking.pricing.currency}</dd>
        <dt className="text-slate-500">Lo que pagas a Carvi</dt><dd className="font-semibold text-carvi">{money(booking.pricing.amountDue)} {booking.pricing.currency}</dd>
        {booking.hold && booking.status === 'HOLD' && <><dt className="text-slate-500">En espera hasta</dt><dd>{fmtDateTime(booking.hold.expiresAt)}</dd></>}
        {booking.payment && (
          <><dt className="text-slate-500">Pago registrado</dt><dd>{booking.payment.externalPaymentId} · {money(booking.payment.amount)} · <Badge tone="blue">{booking.payment.status}</Badge></dd></>
        )}
        {booking.cancellation && (
          <><dt className="text-slate-500">Cancelación</dt><dd>{booking.cancellation.reason ?? 'sin motivo'} · reembolsable {money(booking.cancellation.refundableAmount)}{booking.cancellation.at && ` · ${fmtDateTime(booking.cancellation.at)}`}</dd></>
        )}
        <dt className="text-slate-500">Creada</dt><dd>{fmtDateTime(booking.createdAt)}</dd>
      </dl>
    </div>
  );
}
