import { addMonths, differenceInCalendarMonths, format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useState } from 'react';
import type { UnavailabilityReason } from '../api/types';
import { monthGrid, rangeIsFree } from '../lib/calendar';
import { isoDate } from '../lib/dates';
import { ApiErrorBox } from './ApiErrorBox';
import { Button, cn, Spinner } from './ui';
import { useVehicleCalendar } from './useVehicleCalendar';

export interface DateRange { from: string; to: string }

interface Props {
  vehicleId: string;
  selectable?: boolean;
  value?: DateRange | null;
  onChange?: (range: DateRange) => void;
  className?: string;
}

const VISIBLE_MONTHS = 3;
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const reasonTitle: Record<UnavailabilityReason, string> = { BOOKED: 'Reservado', BLOCKED: 'Bloqueado por el anfitrión' };
const reasonClass: Record<UnavailabilityReason, string> = { BOOKED: 'bg-red-100 text-red-800', BLOCKED: 'bg-slate-200 text-slate-600' };

/** Months between the current month and the month of `date`. */
const monthOffset = (date: string) => differenceInCalendarMonths(parseISO(date), new Date());

/** Three months of a vehicle's unavailability (booked days already include the gap), optionally with range selection. */
export function UnavailabilityCalendar({ vehicleId, selectable = false, value, onChange, className }: Props) {
  const { query, days, span } = useVehicleCalendar(vehicleId);
  const today = isoDate(new Date());
  const maxOffset = Math.max(0, monthOffset(span.to) - (VISIBLE_MONTHS - 1));
  const clampOffset = (n: number) => Math.min(maxOffset, Math.max(0, n));

  const [offset, setOffset] = useState(() => clampOffset(value ? monthOffset(value.from) : 0));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep a range set from outside (e.g. a suggestion) in view: adjust during render, not in an effect.
  const [shownFrom, setShownFrom] = useState(value?.from);
  if (value?.from !== shownFrom) {
    setShownFrom(value?.from);
    if (value) {
      const target = monthOffset(value.from);
      if (target < offset || target >= offset + VISIBLE_MONTHS) setOffset(clampOffset(target));
    }
  }

  const pick = (date: string) => {
    if (!anchor) {
      setAnchor(date);
      setError(null);
      return;
    }
    const range = anchor <= date ? { from: anchor, to: date } : { from: date, to: anchor };
    setAnchor(null);
    if (!rangeIsFree(range.from, range.to, days)) {
      setError('El rango incluye días no disponibles');
      return;
    }
    setError(null);
    onChange?.(range);
  };

  const highlight = anchor ? { from: anchor, to: anchor } : value ?? null;
  const first = startOfMonth(addMonths(new Date(), offset));
  const months = Array.from({ length: VISIBLE_MONTHS }, (_, i) => addMonths(first, i));

  return (
    <div className={cn('space-y-3', className)}>
      {query.isPending && <Spinner label="Cargando calendario…" />}
      {query.error && <ApiErrorBox error={query.error} />}
      {query.data && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setOffset(clampOffset(offset - 1))} disabled={offset === 0} aria-label="Meses anteriores">‹</Button>
            {selectable && (
              <span className="text-sm text-slate-600">{anchor ? 'Elige el día de devolución' : 'Elige el día de recogida'}</span>
            )}
            <Button variant="ghost" onClick={() => setOffset(clampOffset(offset + 1))} disabled={offset >= maxOffset} aria-label="Meses siguientes">›</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {months.map((month) => (
              <div key={month.toISOString()}>
                <div className="mb-1 text-center text-sm font-medium capitalize">{format(month, 'LLLL yyyy', { locale: es })}</div>
                <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                  {WEEKDAYS.map((d) => <div key={d} className="py-1 font-medium text-slate-400">{d}</div>)}
                  {monthGrid(month.getFullYear(), month.getMonth() + 1).flat().map((cell, i) => {
                    if (!cell) return <div key={`pad-${i}`} />;
                    const { date } = cell;
                    const reason = days.get(date);
                    const outside = date < today || date > span.to;
                    const endpoint = !!highlight && (date === highlight.from || date === highlight.to);
                    const inside = !!highlight && date > highlight.from && date < highlight.to;
                    const clickable = selectable && !outside && !reason;
                    return (
                      <button
                        key={date}
                        type="button"
                        disabled={!clickable}
                        onClick={() => pick(date)}
                        title={reason ? reasonTitle[reason] : outside ? undefined : 'Disponible'}
                        className={cn(
                          'rounded py-1.5 tabular-nums',
                          outside ? 'text-slate-300' : reason ? reasonClass[reason] : 'bg-white text-slate-800',
                          !outside && !reason && 'border border-slate-100',
                          inside && !reason && 'bg-sky-100',
                          endpoint && !reason && 'bg-carvi font-semibold text-white',
                          clickable ? 'cursor-pointer hover:ring-1 hover:ring-carvi' : 'cursor-default',
                        )}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {error && <div className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">{error}</div>}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-slate-300 bg-white" />Disponible</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100" />Reservado</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200" />Bloqueado</span>
            {selectable && <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-carvi" />Seleccionado</span>}
          </div>
        </>
      )}
      <p className="text-xs text-slate-400">GET /vehicles/{'{id}'}/unavailability</p>
    </div>
  );
}
