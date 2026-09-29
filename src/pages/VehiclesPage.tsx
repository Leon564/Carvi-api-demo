import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehicles } from '../api/hooks';
import { Pagination } from '../components/Pagination';
import { VehicleCard } from '../components/VehicleCard';
import { Button, EmptyState, PageTitle, Spinner } from '../components/ui';
import { notifyError } from '../lib/notify';

export function VehiclesPage() {
  const [page, setPage] = useState(1);
  const vehicles = useVehicles(page);
  const navigate = useNavigate();
  useEffect(() => {
    if (vehicles.error) notifyError(vehicles.error);
  }, [vehicles.error]);
  return (
    <>
      <PageTitle title="Vehículos" subtitle="Los coches que puedes ofrecer a tus clientes." />
      <p className="-mt-4 mb-4 text-xs text-slate-400">GET /vehicles</p>
      {vehicles.isPending && <Spinner />}
      {vehicles.data && vehicles.data.data.length === 0 && <EmptyState>No hay vehículos publicados.</EmptyState>}
      {vehicles.data && vehicles.data.data.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vehicles.data.data.map((vehicle) => (
              <VehicleCard
                key={vehicle.id}
                vehicle={vehicle}
                onClick={() => navigate(`/vehiculos/${vehicle.id}`)}
                footer={
                  <div className="mt-2 flex justify-end">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/reservar?vehicleId=${vehicle.id}`);
                      }}
                    >
                      Reservar
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
          <Pagination meta={vehicles.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
