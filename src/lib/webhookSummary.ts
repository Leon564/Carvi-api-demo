import { money, STATUS_LABELS } from './format';
import { isPlainObject } from './metadata';

const CANCEL_REASON_LABELS: Record<string, string> = {
  CUSTOMER_REQUEST: 'a petición de tu cliente',
  BACKOFFICE: 'desde el backoffice de Carvi',
  HOST_CANCELLED: 'la canceló el anfitrión',
  NOT_DELIVERED: 'el vehículo no se entregó',
};

const REFUND_RESPONSIBILITY_LABELS: Record<string, string> = {
  PARTNER: 'reembolsas tú',
  CARVI: 'reembolsa Carvi',
};

const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  PAID: 'Pagada',
};

const BOOKING_STATUS_LABELS: Record<string, string> = STATUS_LABELS;

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const label = (labels: Record<string, string>, value: string | null): string | null => (value ? labels[value] ?? value : null);

/** `data` of a webhook envelope (`{ eventId, type, occurredAt, data }`), or null when it is not an object. */
function envelopeData(payload: unknown): Record<string, unknown> | null {
  return isPlainObject(payload) && isPlainObject(payload.data) ? payload.data : null;
}

/** Booking id a webhook refers to (`data.bookingId` of the booking.* events). */
export function webhookBookingId(payload: unknown): string | null {
  return str(envelopeData(payload)?.bookingId);
}

/** Confirmation code a webhook refers to (`data.confirmationCode` of the booking.* events). */
export function webhookConfirmationCode(payload: unknown): string | null {
  return str(envelopeData(payload)?.confirmationCode);
}

function bookingSummary(type: string, data: Record<string, unknown>): string {
  const parts = [str(data.confirmationCode) ?? '(sin código)', label(BOOKING_STATUS_LABELS, str(data.status)) ?? 'sin estado'];
  if (type === 'booking.cancelled') {
    const reason = label(CANCEL_REASON_LABELS, str(data.reason));
    if (reason) parts.push(`motivo: ${reason}`);
    const refund = isPlainObject(data.refund) ? data.refund : null;
    if (refund) {
      const who = label(REFUND_RESPONSIBILITY_LABELS, str(refund.responsibility));
      const amount = num(refund.refundableAmount);
      const text = [who, amount !== null ? `${money(amount)} ${str(refund.currency) ?? 'USD'}` : null].filter(Boolean).join(' ');
      if (text) parts.push(text);
    }
  }
  return parts.join(' · ');
}

function vehicleSummary(data: Record<string, unknown>): string {
  const vehicle = isPlainObject(data.vehicle) ? data.vehicle : null;
  const vehicleName = vehicle ? [str(vehicle.brand), str(vehicle.model)].filter(Boolean).join(' ') : '';
  const name = str(data.name) ?? (vehicleName || null);
  const id = str(data.vehicleId) ?? str(vehicle?.id);
  const parts = [`Vehículo ${[name, id].filter(Boolean).join(' · ') || '(sin id)'} despublicado`];
  const reason = str(data.reason);
  if (reason) parts.push(`motivo: ${reason}`);
  return parts.join(' · ');
}

function settlementSummary(data: Record<string, unknown>): string {
  // The envelope only carries the new status; Carvi does not send the previous one.
  const parts = [`Liquidación ${str(data.settlementId) ?? '(sin id)'} → ${label(SETTLEMENT_STATUS_LABELS, str(data.status)) ?? 'sin estado'}`];
  const period = isPlainObject(data.period) ? data.period : null;
  const from = str(period?.from);
  const to = str(period?.to);
  if (from && to) parts.push(`periodo ${from} → ${to}`);
  const total = num(data.finalTotal);
  if (total !== null) parts.push(`${money(total)} ${str(data.currency) ?? 'USD'}`);
  const reference = str(data.paymentReference);
  if (reference) parts.push(`ref. ${reference}`);
  return parts.join(' · ');
}

/** One readable line for a received webhook, or null when the type or payload is not recognized. */
export function summarizeWebhook(type: string, payload: unknown): string | null {
  const data = envelopeData(payload);
  if (!data) return null;
  if (type.startsWith('booking.')) return bookingSummary(type, data);
  if (type === 'vehicle.unpublished') return vehicleSummary(data);
  if (type === 'settlement.status_changed') return settlementSummary(data);
  return null;
}
