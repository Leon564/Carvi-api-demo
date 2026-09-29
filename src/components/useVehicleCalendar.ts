import { addDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { useUnavailability } from '../api/hooks';
import { unavailableDaySet } from '../lib/calendar';
import { isoDate } from '../lib/dates';

/** Days loaded per vehicle: the maximum window Carvi accepts, starting today. */
export const CALENDAR_WINDOW_DAYS = 180;

/**
 * Unavailability of a vehicle over a fixed window (today + 180 days), computed once per mount so every
 * user of the same vehicle shares one query, plus the day → reason map derived from it.
 */
export function useVehicleCalendar(vehicleId?: string) {
  const [span] = useState(() => {
    const today = new Date();
    return { from: isoDate(today), to: isoDate(addDays(today, CALENDAR_WINDOW_DAYS - 1)) };
  });
  const query = useUnavailability(vehicleId, span.from, span.to);
  const days = useMemo(() => unavailableDaySet(query.data?.data ?? []), [query.data]);
  return { query, days, span, gapHours: query.data?.meta.gapHours };
}
