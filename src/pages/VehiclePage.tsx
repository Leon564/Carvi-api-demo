import { Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useVehicle } from '../api/hooks';
import { CarviApiError } from '../api/client';
import { Badge, Button, Card, PageTitle, Spinner } from '../components/ui';
import { money } from '../lib/format';

export function VehiclePage() {
  const { id } = useParams<{ id: string }>();
  const vehicle = useVehicle(id);
  const navigate = useNavigate();
  if (vehicle.isPending) return <Spinner />;
  if (vehicle.error) {
    const message = vehicle.error instanceof CarviApiError ? `${vehicle.error.code} · ${vehicle.error.message}` : String(vehicle.error);
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{message} · <Link className="underline" to="/vehiculos">Volver a vehículos</Link></div>;
  }
  const v = vehicle.data;
  const specs: Array<[string, string]> = [
    ['Tipo', v.type], ['Transmisión', v.transmission], ['Plazas', String(v.seats)], ['Aire acondicionado', v.airConditioning ? 'Sí' : 'No'],
    ['Consumo', String(v.consumption)], ['Valoración', `★ ${v.rating.average.toFixed(1)} (${v.rating.count})`], ['Anfitrión', v.host.displayName], ['Estado', v.status],
  ];
  return (
    <>
      <PageTitle
        title={`${v.brand} ${v.model} ${v.year}`}
        subtitle={`${v.host.displayName} · ${money(v.rateDay)} por día`}
        actions={<Button onClick={() => navigate(`/reservar?vehicleId=${v.id}`)}>Reservar este vehículo</Button>}
      />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card className="p-0 overflow-hidden">
          <img src={v.images.main} alt="" className="h-72 w-full object-cover" />
          {v.images.gallery.length > 0 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {v.images.gallery.map((src) => <img key={src} src={src} alt="" className="h-20 w-28 shrink-0 rounded object-cover" loading="lazy" />)}
            </div>
          )}
        </Card>
        <Card>
          <p className="mb-2 text-xs text-slate-400">GET /vehicles/{'{id}'}</p>
          <div className="mb-3 text-2xl font-semibold">{money(v.rateDay)} <span className="text-sm font-normal text-slate-500">por día · {v.currency}</span></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {specs.map(([label, value]) => <Fragment key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></Fragment>)}
          </dl>
          <div className="mt-3"><Badge>id: {v.id}</Badge></div>
        </Card>
      </div>
    </>
  );
}
