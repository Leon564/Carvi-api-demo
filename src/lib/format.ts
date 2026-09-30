import type { BookingStatus } from '../api/types';

export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `$${value.toFixed(2)}`;

export const round2 = (value: number): number => Math.round(value * 100) / 100;

export const STATUS_LABELS: Record<BookingStatus, string> = {
  HOLD: 'En espera de pago',
  EXPIRED: 'Vencida',
  CONFIRMED: 'Confirmada',
  STARTED: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

/** `payment.status` of a booking: settlement states for partner bookings, Payment states otherwise. */
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_SETTLEMENT: 'Pendiente de liquidar',
  SETTLED: 'Liquidada',
  PENDING: 'Pendiente',
  SUCCEEDED: 'Cobrado',
  PAID: 'Pagado',
  FAILED: 'Fallido',
  REFUNDED: 'Reembolsado',
  CANCELED: 'Anulado',
};

export const paymentStatusLabel = (status: string): string => PAYMENT_STATUS_LABELS[status] ?? status;
