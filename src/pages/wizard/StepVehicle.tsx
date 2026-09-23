import { useEffect, useMemo, useState } from 'react';
import { useAvailability, useVehicle, useVehicles } from '../../api/hooks';
import type { AvailabilityRow, Vehicle } from '../../api/types';
import { Pagination } from '../../components/Pagination';
import { VehicleCard } from '../../components/VehicleCard';
import { Badge, Button, Spinner } from '../../components/ui';
import type { PeriodInput } from '../../lib/dates';
import { notifyError } from '../../lib/notify';

interface Props {
  period: PeriodInput;
  preselectedId?: string;
  onBack: () => void;
  onSelect: (vehicle: Vehicle) => void;
}

const reasonLabel: Record<NonNullable<AvailabilityRow['reason']>, string> = { BOOKED: 'Reservado', BLOCKED: 'Bloqueado', NOT_FOUND: 'No publicado' };

export function StepVehicle({ period, preselectedId, onBack, onSelect }: Props) {
  const [page, setPage] = useState(1);
  const vehicles = useVehicles(page);
  const preselected = useVehicle(preselectedId);
  useEffect(() => {
    if (preselected.error) notifyError(preselected.error);
  }, [preselected.error]);
  const preselectedVehicle = preselected.data;
  const list = useMemo(() => {
    const pageVehicles = vehicles.data?.data ?? [];
    if (preselectedVehicle && !pageVehicles.some((v) => v.id === preselectedVehicle.id)) {
      return [preselectedVehicle, ...pageVehicles];
    }
    return pageVehicles;
  }, [vehicles.data, preselectedVehicle]);
  const ids = useMemo(() => list.map((v) => v.id), [list]);
  const availability = useAvailability(ids.length ? { vehicleIds: ids, ...period } : null);
  useEffect(() => {
    if (availability.error) notifyError(availability.error);
  }, [availability.error]);
  const rows = new Map(availability.data?.data.map((row) => [row.vehicleId, row]));
  return (
    <>
      <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
        <span>
          <code>GET /availability</code> sobre los vehículos de esta página ·{' '}
          {availability.data ? `colchón de ${availability.data.meta.gapHours} h entre reservas · ${availability.data.meta.timezone}` : availability.isFetching ? 'consultando…' : ''}
        </span>
        <Button variant="secondary" onClick={onBack}>Cambiar periodo</Button>
      </div>
      {vehicles.isPending && <Spinner />}
      {vehicles.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((vehicle) => {
              const row = rows.get(vehicle.id);
              const available = row?.available ?? false;
              return (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  disabled={!available}
                  selected={vehicle.id === preselectedId}
                  onClick={() => onSelect(vehicle)}
                  footer={
                    <div className="mt-1 flex flex-wrap gap-1">
                      {vehicle.id === preselectedId && <Badge tone="blue">Preseleccionado desde el catálogo</Badge>}
                      {!row && availability.isFetching && <Badge>comprobando…</Badge>}
                      {row && available && <Badge tone="green">Disponible</Badge>}
                      {row && !available && <Badge tone="red">{row.reason ? reasonLabel[row.reason] : 'No disponible'}</Badge>}
                    </div>
                  }
                />
              );
            })}
          </div>
          <Pagination meta={vehicles.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
