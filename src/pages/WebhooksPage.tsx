import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { local } from '../api/client';
import { useServerConfig } from '../api/hooks';
import { Badge, Card, EmptyState, JsonBlock, PageTitle, Select, cn, type Tone } from '../components/ui';
import { fmtDateTime } from '../lib/dates';
import { useEventSource } from '../lib/sse';

interface ReceivedEvent {
  id: string;
  receivedAt: string;
  type: string;
  eventId: string;
  keyId: string;
  timestamp: string;
  signatureStatus: 'VALID' | 'INVALID' | 'UNVERIFIED';
  reason?: string;
  duplicate: boolean;
  payload: unknown;
  headers: Record<string, string>;
}

const EVENT_TYPES = ['booking.confirmed', 'booking.cancelled', 'booking.expired', 'booking.started', 'booking.completed', 'vehicle.unpublished', 'settlement.status_changed'];
const signatureTone: Record<ReceivedEvent['signatureStatus'], Tone> = { VALID: 'green', INVALID: 'red', UNVERIFIED: 'amber' };

function EventRow({ event }: { event: ReceivedEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="p-0">
      <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-slate-500">{fmtDateTime(event.receivedAt)}</span>
        <Badge tone="blue">{event.type}</Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{event.eventId || '(sin eventId)'}</span>
        <span className="font-mono text-xs text-slate-500">{event.keyId}</span>
        {event.duplicate && <Badge tone="neutral">duplicado</Badge>}
        <Badge tone={signatureTone[event.signatureStatus]}>firma {event.signatureStatus}{event.reason ? ` · ${event.reason}` : ''}</Badge>
      </button>
      {expanded && (
        <div className={cn('grid gap-3 border-t border-slate-100 p-3 text-xs', 'md:grid-cols-2')}>
          <div><div className="mb-1 font-semibold text-slate-600">Cabeceras</div><JsonBlock value={event.headers} className="max-h-60" /></div>
          <div><div className="mb-1 font-semibold text-slate-600">Sobre</div><JsonBlock value={event.payload} className="max-h-96" /></div>
        </div>
      )}
    </Card>
  );
}

export function WebhooksPage() {
  const [events, setEvents] = useState<ReceivedEvent[]>([]);
  const [type, setType] = useState('');
  const config = useServerConfig();
  useEffect(() => {
    // Merge instead of replacing: events already pushed over SSE while this GET was in flight must not be lost.
    local
      .get<ReceivedEvent[]>('/events')
      .then((res) => {
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...res.data.filter((e) => !seen.has(e.id))].slice(0, 200);
        });
      })
      .catch(() => undefined);
  }, []);
  const { connected } = useEventSource<ReceivedEvent>('/api/events/stream', (event) => setEvents((prev) => [event, ...prev].slice(0, 200)));
  const visible = useMemo(() => (type ? events.filter((e) => e.type === type) : events), [events, type]);
  return (
    <>
      <PageTitle
        title="Webhooks"
        subtitle="Carvi envía POST firmados a tu webhookUrl. El servidor del demo verifica HMAC-SHA256 sobre «timestamp.cuerpo», acepta firma doble en rotación y deduplica por eventId."
        actions={<span className="flex items-center gap-2 text-sm text-slate-500"><span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} />{connected ? 'escuchando' : 'reconectando'}</span>}
      />
      <Card className="mb-4 text-sm">
        <div>URL a configurar en el portal: <code className="font-mono">{config.data?.webhookUrl ?? '…'}</code></div>
        <div className="mt-1 text-slate-500">Responde 2xx en menos de 5 s · sin garantía de orden (resuelve por occurredAt y data.status) · reintentos con retroceso hasta 8 veces · eventId estable: deduplica por él.</div>
      </Card>
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
