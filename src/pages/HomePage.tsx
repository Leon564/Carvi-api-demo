import { Car, CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useBookings, useHealth, useReceivedEvents, useServerConfig } from '../api/hooks';
import { ApiErrorBox } from '../components/ApiErrorBox';
import { BookingDetailDrawer } from '../components/booking/BookingDetailDrawer';
import { StatusBadge } from '../components/StatusBadge';
import { Badge, Button, Card, PageTitle, Spinner } from '../components/ui';
import { SignatureBadge } from '../components/webhooks/EventBadges';
import { fmtDateTime } from '../lib/dates';
import { money } from '../lib/format';

function ConnectionCard() {
  const health = useHealth();
  const config = useServerConfig();
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Conexión con Carvi</h2>
          <p className="text-xs text-slate-400">GET /health</p>
        </div>
        <Button variant="secondary" onClick={() => health.refetch()} disabled={health.isFetching}>{health.isFetching ? 'Comprobando…' : 'Comprobar'}</Button>
      </div>
      {health.isPending && <Spinner />}
      {health.error && (
        <ApiErrorBox error={health.error}>
          {config.data && <span className="text-xs">API configurada: <code>{config.data.apiBaseUrl}</code></span>}
        </ApiErrorBox>
      )}
      {health.data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Estado</dt>
          <dd className="flex gap-1">
            <Badge tone="green">Conectado</Badge>
            {health.data.database !== 'up' && <Badge tone="red">base de datos caída</Badge>}
          </dd>
          <dt className="text-slate-500">Entorno</dt>
          <dd>{health.data.environment === 'production' ? <Badge tone="green">Producción</Badge> : <Badge tone="amber">Sandbox</Badge>}</dd>
          <dt className="text-slate-500">client_id</dt><dd className="break-all font-mono text-xs">{health.data.credential.clientId}</dd>
          <dt className="text-slate-500">Permisos</dt>
          <dd className="flex flex-wrap gap-1">{health.data.credential.scopes.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}</dd>
        </dl>
      )}
    </Card>
  );
}

function WebhooksCard() {
  const config = useServerConfig();
  const c = config.data;
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="font-semibold">Webhooks</h2>
        <Link to="/webhooks" className="text-sm text-carvi hover:underline">Ver eventos</Link>
      </div>
      {config.isPending && <Spinner />}
      {c && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">URL a configurar</dt><dd className="break-all font-mono text-xs">{c.webhookUrl}</dd>
          <dt className="text-slate-500">Firma</dt>
          <dd>
            {c.webhookSecretsConfigured > 0
              ? <Badge tone="green">Con secreto ({c.webhookSecretsConfigured})</Badge>
              : <Badge tone="blue">Sin secreto · las entregas llegan sin firmar</Badge>}
          </dd>
          <dt className="text-slate-500">Token</dt>
          <dd>{c.webhookAuthTokenConfigured ? <Badge tone="green">Configurado</Badge> : <Badge>No se exige</Badge>}</dd>
        </dl>
      )}
    </Card>
  );
}

function RecentBookings({ onOpen }: { onOpen: (id: string) => void }) {
  const bookings = useBookings({ page: 1, limit: 5 });
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Últimas reservas</h2>
          <p className="text-xs text-slate-400">GET /bookings</p>
        </div>
        <Link to="/reservas" className="text-sm text-carvi hover:underline">Ver todas</Link>
      </div>
      {bookings.isPending && <Spinner />}
      {bookings.error && <ApiErrorBox error={bookings.error} />}
      {bookings.data && bookings.data.data.length === 0 && <p className="text-sm text-slate-500">Todavía no has creado reservas.</p>}
      {bookings.data && bookings.data.data.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {bookings.data.data.map((b) => (
            <li key={b.id}>
              <button className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50" onClick={() => onOpen(b.id)}>
                <span className="font-mono">{b.confirmationCode}</span>
                <StatusBadge status={b.status} />
                <span className="min-w-0 flex-1 truncate text-slate-600">{b.customer.fullName}</span>
                <span className="font-medium">{money(b.pricing.amountDue)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentEvents() {
  const { events } = useReceivedEvents();
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="font-semibold">Últimos eventos</h2>
        <Link to="/webhooks" className="text-sm text-carvi hover:underline">Ver todos</Link>
      </div>
      {events.length === 0 && <p className="text-sm text-slate-500">Aún no ha llegado ningún webhook.</p>}
      <ul className="divide-y divide-slate-100 text-sm">
        {events.slice(0, 5).map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <Badge tone="blue">{e.type}</Badge>
            <span className="min-w-0 flex-1 truncate text-slate-500">{fmtDateTime(e.receivedAt)}</span>
            <SignatureBadge event={e} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <PageTitle
        title="Inicio"
        subtitle="Tu agencia conectada a Carvi: reserva coches para tus clientes y recibe los cambios por webhook."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => navigate('/reservar')}><CalendarPlus size={16} /> Nueva reserva</Button>
            <Button variant="secondary" onClick={() => navigate('/vehiculos')}><Car size={16} /> Ver vehículos</Button>
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ConnectionCard />
        <WebhooksCard />
        <RecentBookings onOpen={setSelected} />
        <RecentEvents />
      </div>
      {selected && <BookingDetailDrawer id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
