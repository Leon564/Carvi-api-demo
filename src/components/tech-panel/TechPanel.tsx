import { ChevronDown, ChevronRight, Terminal, X } from 'lucide-react';
import { useState } from 'react';
import { fmtTime } from '../../lib/dates';
import { Badge, Button, JsonBlock, cn } from '../ui';
import { useTechPanel, type Exchange } from './TechPanelContext';

const statusTone = (status: number) => (status === 0 || status >= 500 ? 'red' : status >= 400 ? 'amber' : 'green');

function errorCode(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { code?: unknown } }).error;
    if (error && typeof error.code === 'string') return error.code;
  }
  return null;
}

const INTERESTING_REQUEST = ['Idempotency-Key', 'X-Request-Id', 'Authorization'];
const INTERESTING_RESPONSE = ['x-request-id', 'idempotent-replayed', 'retry-after', 'cache-control'];

function pick(headers: Record<string, string>, names: string[]) {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => names.some((n) => n.toLowerCase() === k.toLowerCase())));
}

function ExchangeRow({ exchange }: { exchange: Exchange }) {
  const [expanded, setExpanded] = useState(false);
  const code = errorCode(exchange.responseBody);
  const replayed = exchange.responseHeaders['idempotent-replayed'] === 'true';
  const query = Object.entries(exchange.query).map(([k, v]) => `${k}=${v}`).join('&');
  return (
    <div className="border-b border-slate-200">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="w-14 font-mono font-semibold">{exchange.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono">{exchange.path}{query && `?${query}`}</span>
        {replayed && <Badge tone="blue">replayed</Badge>}
        {code && <Badge tone="red">{code}</Badge>}
        <Badge tone={statusTone(exchange.status)}>{exchange.status || 'sin respuesta'}</Badge>
        <span className="w-16 text-right text-slate-400">{exchange.durationMs} ms</span>
        <span className="text-slate-400">{fmtTime(exchange.at)}</span>
      </button>
      {expanded && (
        <div className="space-y-2 bg-slate-50 px-3 pb-3 text-xs">
          <div>
            <div className="mb-1 font-semibold text-slate-600">Petición</div>
            <JsonBlock value={{ headers: pick(exchange.requestHeaders, INTERESTING_REQUEST), body: exchange.requestBody }} className="max-h-60" />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-600">Respuesta</div>
            <JsonBlock value={{ headers: pick(exchange.responseHeaders, INTERESTING_RESPONSE), body: exchange.responseBody }} className="max-h-72" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TechPanel() {
  const { exchanges, open, setOpen, clear, connected } = useTechPanel();
  return (
    <>
      <button
        className="fixed bottom-4 right-4 z-[36] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg hover:bg-slate-700"
        onClick={() => setOpen(!open)}
        aria-label="Panel técnico"
      >
        <Terminal size={16} /> Panel técnico <Badge tone="neutral">{exchanges.length}</Badge>
      </button>
      <aside className={cn('fixed inset-y-0 right-0 z-[35] flex w-[520px] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl transition-transform', open ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            Peticiones a Carvi
            <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} title={connected ? 'conectado' : 'reconectando'} />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={clear}>Limpiar</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {exchanges.length === 0 && <p className="p-4 text-sm text-slate-500">Todavía no hay peticiones. Cada llamada a la API aparecerá aquí con sus cabeceras y cuerpos.</p>}
          {exchanges.map((exchange) => <ExchangeRow key={exchange.id} exchange={exchange} />)}
        </div>
      </aside>
    </>
  );
}
