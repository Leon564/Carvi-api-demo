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
