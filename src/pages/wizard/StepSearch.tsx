import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useAvailability, useCreateQuote, useVehicle, useVehicles } from '../../api/hooks';
import type { AvailabilityRow, Quote, Vehicle } from '../../api/types';
import { ApiErrorBox } from '../../components/ApiErrorBox';
import { Pagination } from '../../components/Pagination';
import { VehicleCard } from '../../components/VehicleCard';
import { Badge, Button, Card, EmptyState, Field, Input, Spinner } from '../../components/ui';
import { calendarDaysInclusive, MIN_RENT_DAYS, type PeriodInput } from '../../lib/dates';
import { isPlainObject } from '../../lib/metadata';
import { notifyError } from '../../lib/notify';
import { CalendarModal } from './CalendarModal';

/** Only the minimum-duration rejection carries `details.minDays`; other validation errors get no date hint. */
function minDaysHint(details: unknown): string | undefined {
  if (!isPlainObject(details) || typeof details.minDays !== 'number') return undefined;
  return `Ajusta las fechas: la renta debe durar al menos ${details.minDays} días de calendario.`;
}

interface Props {
  period: PeriodInput;
  preselectedId?: string;
  onSearch: (period: PeriodInput) => void;
  onQuoted: (vehicle: Vehicle, quote: Quote) => void;
}

const reasonLabel: Record<NonNullable<AvailabilityRow['reason']>, string> = {
  BOOKED: 'Ya reservado en esas fechas',
  BLOCKED: 'Bloqueado por el anfitrión',
  NOT_FOUND: 'Ya no está publicado',
};

const samePeriod = (a: PeriodInput, b: PeriodInput) => a.from === b.from && a.to === b.to && a.startTime === b.startTime && a.endTime === b.endTime;

export function StepSearch({ period, preselectedId, onSearch, onQuoted }: Props) {
  const [draft, setDraft] = useState(period);
  const [page, setPage] = useState(1);
  const vehicles = useVehicles(page);
  const preselected = useVehicle(preselectedId);
  const quote = useCreateQuote();
  const [calendarFor, setCalendarFor] = useState<Vehicle | null>(null);

  const list = useMemo(() => {
    const pageVehicles = vehicles.data?.data ?? [];
    const first = preselected.data;
    if (!first) return pageVehicles;
    return [first, ...pageVehicles.filter((v) => v.id !== first.id)];
  }, [vehicles.data, preselected.data]);
  const ids = useMemo(() => list.map((v) => v.id), [list]);
  const availability = useAvailability(ids.length ? { vehicleIds: ids, ...period } : null);
  useEffect(() => {
    if (vehicles.error) notifyError(vehicles.error);
  }, [vehicles.error]);
  useEffect(() => {
    if (availability.error) notifyError(availability.error);
  }, [availability.error]);
  const rows = new Map(availability.data?.data.map((row) => [row.vehicleId, row]));

  const days = draft.from && draft.to ? calendarDaysInclusive(draft.from, draft.to) : 0;
  const complete = !!(draft.from && draft.to && draft.startTime && draft.endTime);
  const pendingSearch = !samePeriod(draft, period);
  const search = (next: PeriodInput) => {
    quote.reset();
    onSearch(next);
  };
  const set = (key: keyof PeriodInput) => (e: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  const choose = (vehicle: Vehicle) => {
    quote.mutate({ vehicleId: vehicle.id, ...period }, { onSuccess: (q) => onQuoted(vehicle, q) });
  };
  const quotingId = quote.isPending ? quote.variables?.vehicleId : undefined;
  const failedId = quote.error ? quote.variables?.vehicleId : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (complete) search(draft);
          }}
        >
          <Field label="Recogida"><Input type="date" value={draft.from} onChange={set('from')} /></Field>
          <Field label="Devolución"><Input type="date" value={draft.to} onChange={set('to')} /></Field>
          <Field label="Hora de recogida"><Input type="time" value={draft.startTime} onChange={set('startTime')} /></Field>
          <Field label="Hora de devolución"><Input type="time" value={draft.endTime} onChange={set('endTime')} /></Field>
          <Button type="submit" disabled={!complete}>Buscar</Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {days > 0 && <Badge tone={days < MIN_RENT_DAYS ? 'amber' : 'neutral'}>{days} {days === 1 ? 'día' : 'días'}</Badge>}
          {days > 0 && days < MIN_RENT_DAYS && <span className="text-amber-700">Carvi exige un mínimo de {MIN_RENT_DAYS} días: la cotización fallará con estas fechas.</span>}
          {pendingSearch && complete && <span className="text-slate-500">Pulsa «Buscar» para ver la disponibilidad de las nuevas fechas.</span>}
        </div>
        <p className="mt-2 text-xs text-slate-400">GET /vehicles · GET /availability · POST /quotes</p>
      </Card>

      {vehicles.isPending && <Spinner />}
      {vehicles.data && list.length === 0 && <EmptyState>No hay vehículos publicados.</EmptyState>}
      {vehicles.data && list.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((vehicle) => {
              const row = rows.get(vehicle.id);
              const available = row?.available ?? false;
              const marked = vehicle.id === preselectedId;
              return (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  selected={marked}
                  className={row && !available ? 'opacity-60 transition-opacity hover:opacity-100' : undefined}
                  footer={
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {marked && <Badge tone="blue">Seleccionado</Badge>}
                        {!row && availability.isFetching && <Badge>comprobando…</Badge>}
                        {row && available && <Badge tone="green">Disponible</Badge>}
                        {row && !available && <span className="text-xs text-slate-500">{row.reason ? reasonLabel[row.reason] : 'No disponible'}</span>}
                      </div>
                      {row?.reason === 'BOOKED' ? (
                        <div className="space-y-1">
                          <Button className="w-full justify-center" onClick={() => setCalendarFor(vehicle)}>Ver calendario</Button>
                          <p className="text-center text-xs text-slate-500">Busca en su calendario unas fechas libres.</p>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          {row && available && (
                            <Button className="flex-1 justify-center" onClick={() => choose(vehicle)} disabled={quote.isPending}>
                              {quotingId === vehicle.id ? 'Cotizando…' : 'Elegir'}
                            </Button>
                          )}
                          <Button variant="secondary" className={row && available ? undefined : 'flex-1 justify-center'} onClick={() => setCalendarFor(vehicle)}>
                            Ver calendario
                          </Button>
                        </div>
                      )}
                      {failedId === vehicle.id && quote.error && (
                        <ApiErrorBox
                          error={quote.error}
                          hint={minDaysHint(quote.error.details)}
                        />
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
          <Pagination meta={vehicles.data.meta} onPage={setPage} />
        </>
      )}
      {calendarFor && (
        <CalendarModal
          key={calendarFor.id}
          vehicle={calendarFor}
          period={draft}
          onClose={() => setCalendarFor(null)}
          onUse={(range) => {
            const next = { ...draft, ...range };
            setDraft(next);
            search(next);
            setCalendarFor(null);
          }}
        />
      )}
    </div>
  );
}
