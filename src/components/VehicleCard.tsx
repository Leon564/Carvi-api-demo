import type { ReactNode } from 'react';
import type { Vehicle } from '../api/types';
import { money } from '../lib/format';
import { Badge, Card, cn } from './ui';

interface Props {
  vehicle: Vehicle;
  footer?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
}

export function VehicleCard({ vehicle, footer, onClick, disabled, selected, className }: Props) {
  return (
    <Card
      className={cn('flex flex-col gap-2 p-0 overflow-hidden', onClick && !disabled && 'cursor-pointer hover:shadow-md', disabled && 'opacity-50', selected && 'ring-2 ring-carvi', className)}
      onClick={disabled ? undefined : onClick}
    >
      <img src={vehicle.images.main} alt={`${vehicle.brand} ${vehicle.model}`} className="h-40 w-full object-cover" loading="lazy" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold">{vehicle.brand} {vehicle.model} <span className="font-normal text-slate-500">{vehicle.year}</span></div>
          <div className="text-right text-sm"><span className="font-semibold">{money(vehicle.rateDay)}</span><span className="text-slate-500">/día</span></div>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          <Badge>{vehicle.type}</Badge><Badge>{vehicle.transmission}</Badge><Badge>{vehicle.seats} plazas</Badge>{vehicle.airConditioning && <Badge>A/C</Badge>}
        </div>
        <div className="text-xs text-slate-500">★ {vehicle.rating.average.toFixed(1)} ({vehicle.rating.count}) · {vehicle.host.displayName}</div>
        {footer}
      </div>
    </Card>
  );
}
