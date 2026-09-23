import { Activity, Car, CalendarPlus, ListOrdered, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from './ui';

const NAV = [
  { to: '/', label: 'Estado', icon: Activity, end: true },
  { to: '/catalogo', label: 'Catálogo', icon: Car },
  { to: '/reservar', label: 'Reservar', icon: CalendarPlus },
  { to: '/reservas', label: 'Reservas', icon: ListOrdered },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
];

export function Layout({ techPanel }: { techPanel?: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6">
          <div className="text-lg font-bold text-carvi">Demo de socio</div>
          <div className="text-xs text-slate-500">API de integración de Carvi</div>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm', isActive ? 'bg-sky-50 font-semibold text-carvi' : 'text-slate-700 hover:bg-slate-100')}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
      {techPanel}
    </div>
  );
}
