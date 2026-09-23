import { useHealth, useServerConfig } from '../api/hooks';
import { CarviApiError } from '../api/client';
import { fmtDateTime } from '../lib/dates';
import { Badge, Button, Card, PageTitle, Spinner } from '../components/ui';

export function StatusPage() {
  const health = useHealth();
  const config = useServerConfig();
  return (
    <>
      <PageTitle
        title="Estado"
        subtitle="GET /health confirma contra qué entorno y con qué credencial opera el demo."
        actions={<Button variant="secondary" onClick={() => health.refetch()} disabled={health.isFetching}>Comprobar de nuevo</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Salud de la API</h2>
          {health.isPending && <Spinner />}
          {health.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {health.error instanceof CarviApiError ? `${health.error.code} · ${health.error.message}` : String(health.error)}
              {health.error instanceof CarviApiError && health.error.code === 'UPSTREAM_UNREACHABLE' && config.data && (
                <p className="mt-1">No hay conexión con la API de Carvi. ¿Está el backend arrancado en {config.data.apiBaseUrl}?</p>
              )}
            </div>
          )}
          {health.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Estado</dt><dd><Badge tone="green">{health.data.status}</Badge></dd>
              <dt className="text-slate-500">Entorno</dt><dd><Badge tone={health.data.environment === 'production' ? 'green' : 'amber'}>{health.data.environment}</Badge></dd>
              <dt className="text-slate-500">Base de datos</dt><dd><Badge tone={health.data.database === 'up' ? 'green' : 'red'}>{health.data.database}</Badge></dd>
              <dt className="text-slate-500">Hora del servidor</dt><dd>{fmtDateTime(health.data.time)}</dd>
              <dt className="text-slate-500">Credencial</dt><dd className="font-mono text-xs">{health.data.credential.clientId}</dd>
              <dt className="text-slate-500">Scopes</dt><dd className="flex gap-1">{health.data.credential.scopes.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}</dd>
            </dl>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Configuración del demo</h2>
          {config.isPending && <Spinner />}
          {config.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">API de Carvi</dt><dd className="font-mono text-xs">{config.data.apiBaseUrl}</dd>
              <dt className="text-slate-500">client_id</dt><dd className="font-mono text-xs">{config.data.clientId}</dd>
              <dt className="text-slate-500">URL de webhook</dt><dd className="font-mono text-xs">{config.data.webhookUrl}</dd>
              <dt className="text-slate-500">Secretos de webhook</dt>
              <dd>{config.data.webhookSecretsConfigured > 0 ? <Badge tone="green">{config.data.webhookSecretsConfigured} configurado(s)</Badge> : <Badge tone="amber">ninguno · las entregas se marcarán sin verificar</Badge>}</dd>
            </dl>
          )}
          <p className="mt-4 text-xs text-slate-500">Configura la URL de webhook en la credencial desde el portal de integraciones y copia su secreto en <code>CARVI_WEBHOOK_SECRETS</code>.</p>
        </Card>
      </div>
    </>
  );
}
