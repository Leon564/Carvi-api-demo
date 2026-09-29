import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useState } from 'react';
import type { Vehicle } from '../../api/types';
import { UnavailabilityCalendar, type DateRange } from '../../components/UnavailabilityCalendar';
import { Badge, Button, Modal } from '../../components/ui';
import { useVehicleCalendar } from '../../components/useVehicleCalendar';
import { firstFreeRange, rangeIsFree } from '../../lib/calendar';
import { calendarDaysInclusive, fmtDate, MIN_RENT_DAYS, type PeriodInput } from '../../lib/dates';

interface Props {
  vehicle: Vehicle;
  period: PeriodInput;
  onClose: () => void;
  onUse: (range: DateRange) => void;
}

/** A vehicle's calendar to pick a free range; starts on the dates currently in the search form. */
export function CalendarModal({ vehicle, period, onClose, onUse }: Props) {
  const { query, days, span } = useVehicleCalendar(vehicle.id);
  const [range, setRange] = useState<DateRange | null>(period.from && period.to ? { from: period.from, to: period.to } : null);

  const count = range ? calendarDaysInclusive(range.from, range.to) : 0;
  const usable = !!range && !!query.data && range.from >= span.from && range.to <= span.to && rangeIsFree(range.from, range.to, days);
  const wanted = Math.max(MIN_RENT_DAYS, period.from && period.to ? calendarDaysInclusive(period.from, period.to) : 0);
  const startFrom = period.from && period.from > span.from ? period.from : span.from;
  const suggestion = query.data
    ? firstFreeRange(startFrom, wanted, days, differenceInCalendarDays(parseISO(span.to), parseISO(startFrom)) + 1)
    : null;

  return (
    <Modal open title={`Calendario · ${vehicle.brand} ${vehicle.model}`} onClose={onClose} className="max-w-4xl">
      <UnavailabilityCalendar vehicleId={vehicle.id} selectable value={range} onChange={setRange} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {range ? (
            <>
              <span>{fmtDate(range.from)} → {fmtDate(range.to)}</span>
              <Badge tone={count < MIN_RENT_DAYS ? 'amber' : 'neutral'}>{count} {count === 1 ? 'día' : 'días'}</Badge>
              {count < MIN_RENT_DAYS && <span className="text-amber-700">Mínimo de Carvi: {MIN_RENT_DAYS} días.</span>}
              {query.data && !usable && <span className="text-red-700">Estas fechas no están libres.</span>}
            </>
          ) : (
            <span className="text-slate-500">Elige recogida y devolución en el calendario.</span>
          )}
          {suggestion && (range?.from !== suggestion.from || range?.to !== suggestion.to) && (
            <Button variant="ghost" className="text-carvi" onClick={() => setRange(suggestion)}>
              Primer hueco libre de {wanted} días: {fmtDate(suggestion.from)} → {fmtDate(suggestion.to)}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          <Button disabled={!usable} onClick={() => range && onUse(range)}>Usar estas fechas</Button>
        </div>
      </div>
    </Modal>
  );
}
