import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehicles } from '../api/hooks';
import { Pagination } from '../components/Pagination';
import { VehicleCard } from '../components/VehicleCard';
import { EmptyState, PageTitle, Spinner } from '../components/ui';
import { notifyError } from '../lib/notify';

export function CatalogPage() {
  const [page, setPage] = useState(1);
  const vehicles = useVehicles(page);
  const navigate = useNavigate();
  useEffect(() => {
    if (vehicles.error) notifyError(vehicles.error);
  }, [vehicles.error]);
  return (
    <>
      <PageTitle title="Catálogo" subtitle="GET /vehicles · vehículos publicados. Requiere el scope catalog:read; la respuesta se cachea 15 minutos." />
      {vehicles.isPending && <Spinner />}
      {vehicles.data && vehicles.data.data.length === 0 && <EmptyState>No hay vehículos publicados.</EmptyState>}
      {vehicles.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vehicles.data.data.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} onClick={() => navigate(`/catalogo/${vehicle.id}`)} />
            ))}
          </div>
          <Pagination meta={vehicles.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
