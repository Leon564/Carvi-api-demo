import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useReceivedEvents, useServerConfig } from '../api/hooks';
import type { ReceivedEvent } from '../api/types';
import { MetadataTable } from '../components/MetadataTable';
import { Badge, Card, EmptyState, JsonBlock, PageTitle, Select, Spinner, cn } from '../components/ui';
import { AuthBadge, DuplicateBadge, SignatureBadge } from '../components/webhooks/EventBadges';
import { fmtDateTime } from '../lib/dates';
import { isPlainObject } from '../lib/metadata';

const EVENT_TYPES = ['booking.confirmed', 'booking.cancelled', 'booking.expired', 'booking.started', 'booking.completed', 'vehicle.unpublished', 'settlement.status_changed'];

/** `payload.data.booking.metadata` when the envelope carries a flat object there. */
function bookingMetadata(payload: unknown): Record<string, unknown> | null {
  if (!isPlainObject(payload) || !isPlainObject(payload.data) || !isPlainObject(payload.data.booking)) return null;
  const metadata = payload.data.booking.metadata;
  return isPlainObject(metadata) ? metadata : null;
}

function EventRow({ event }: { event: ReceivedEvent }) {
  const [expanded, setExpanded] = useState(false);
  const metadata = bookingMetadata(event.payload);
  return (
    <Card className={cn('p-0', !event.accepted && 'border-red-200')}>
      <button className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-slate-500">{fmtDateTime(event.receivedAt)}</span>
        <Badge tone="blue">{event.type}</Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{event.eventId || '(sin eventId)'}</span>
        <DuplicateBadge duplicate={event.duplicate} />
        <AuthBadge status={event.authStatus} />
        <SignatureBadge event={event} />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-slate-100 p-3 text-xs">
          {metadata && (
            <div>
              <div className="mb-1 font-semibold text-slate-600">Datos adicionales de la reserva</div>
              <MetadataTable metadata={metadata} className="max-w-xl" />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div><div className="mb-1 font-semibold text-slate-600">Cabeceras</div><JsonBlock value={event.headers} className="max-h-60" /></div>
            <div><div className="mb-1 font-semibold text-slate-600">Sobre</div><JsonBlock value={event.payload} className="max-h-96" /></div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ConfigCard() {
  const config = useServerConfig();
  const c = config.data;
  return (
    <Card className="mb-4 text-sm">
      {config.isPending && <Spinner />}
      {c && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-slate-500">URL a configurar</dt><dd className="break-all font-mono text-xs">{c.webhookUrl}</dd>
            <dt className="text-slate-500">Firma</dt>
            <dd>
              {c.webhookSecretsConfigured > 0
                ? <Badge tone="green">Con secreto ({c.webhookSecretsConfigured}) · se rechazan las entregas sin firma válida</Badge>
                : <Badge tone="blue">Sin secreto · las entregas llegan sin firmar</Badge>}
            </dd>
            <dt className="text-slate-500">Token</dt>
            <dd>
              {c.webhookAuthTokenConfigured
                ? <Badge tone="green">Configurado · se exige Authorization: Bearer</Badge>
                : <Badge>No se exige</Badge>}
            </dd>
          </dl>
          {c.webhookSecretsConfigured === 0 && (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-amber-800">
              Recomendado: configura un secreto de webhook en el portal de integraciones y cópialo en <code>CARVI_WEBHOOK_SECRETS</code>. Así podrás comprobar que cada entrega viene de Carvi.
            </p>
          )}
        </>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Responde en menos de 5 s · los eventos pueden llegar desordenados · Carvi reintenta hasta 8 veces · usa el eventId para no procesar dos veces el mismo evento.
      </p>
    </Card>
  );
}

export function WebhooksPage() {
  const { events, connected } = useReceivedEvents();
  const [type, setType] = useState('');
  const visible = useMemo(() => (type ? events.filter((e) => e.type === type) : events), [events, type]);
  return (
    <>
      <PageTitle
        title="Webhooks"
        subtitle="Los avisos que Carvi envía cuando cambia una de tus reservas."
        actions={<span className="flex items-center gap-2 text-sm text-slate-500"><span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} />{connected ? 'escuchando' : 'reconectando'}</span>}
      />
      <p className="-mt-4 mb-4 text-xs text-slate-400">POST /webhooks/carvi</p>
      <ConfigCard />
      <div className="mb-3 max-w-xs">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      {visible.length === 0 && <EmptyState>Todavía no ha llegado ningún evento. Confirma o cancela una reserva y aparecerá aquí en cuanto Carvi lo entregue.</EmptyState>}
      <div className="space-y-2">{visible.map((event) => <EventRow key={event.id} event={event} />)}</div>
    </>
  );
}
