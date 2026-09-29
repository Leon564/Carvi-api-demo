import type { BookingStatus } from '../api/types';
import { STATUS_LABELS } from '../lib/format';
import { Badge, type Tone } from './ui';

const tones: Record<BookingStatus, Tone> = { HOLD: 'amber', EXPIRED: 'neutral', CONFIRMED: 'green', STARTED: 'blue', COMPLETED: 'blue', CANCELLED: 'red' };

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={tones[status] ?? 'neutral'}>{STATUS_LABELS[status] ?? status}</Badge>;
}
