import type { BookingStatus } from '../api/types';
import { Badge, type Tone } from './ui';

const tones: Record<BookingStatus, Tone> = { HOLD: 'amber', EXPIRED: 'neutral', CONFIRMED: 'green', STARTED: 'blue', COMPLETED: 'blue', CANCELLED: 'red' };
const labels: Record<BookingStatus, string> = { HOLD: 'En hold', EXPIRED: 'Vencida', CONFIRMED: 'Confirmada', STARTED: 'En curso', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={tones[status] ?? 'neutral'}>{labels[status] ?? status}</Badge>;
}
