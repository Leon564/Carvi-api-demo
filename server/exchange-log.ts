import { randomUUID } from 'node:crypto';
import type { SseChannel } from './sse';

export interface Exchange {
  id: string;
  at: string;
  method: string;
  path: string;
  query: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

export type ExchangeInput = Omit<Exchange, 'id' | 'at'>;

const SENSITIVE_HEADERS = new Set(['authorization']);
const SENSITIVE_FIELDS = new Set(['client_secret']);

/** Keeps a leading scheme word (e.g. "Bearer") when present and masks the rest; masks entirely otherwise. */
function maskAuthorization(value: string): string {
  const spaceIndex = value.indexOf(' ');
  return spaceIndex === -1 ? '****' : `${value.slice(0, spaceIndex)} ****`;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? maskAuthorization(value) : value;
  }
  return out;
}

export function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_FIELDS.has(key) ? '****' : value;
  }
  return out;
}

/** In-memory ring buffer of HTTP exchanges with Carvi, newest first, mirrored over SSE. */
export class ExchangeLog {
  private readonly items: Exchange[] = [];

  constructor(
    private readonly channel: SseChannel<Exchange>,
    private readonly max = 200,
  ) {}

  record(input: ExchangeInput): Exchange {
    const exchange: Exchange = {
      ...input,
      id: randomUUID(),
      at: new Date().toISOString(),
      requestHeaders: redactHeaders(input.requestHeaders),
      requestBody: redactBody(input.requestBody),
    };
    this.items.unshift(exchange);
    if (this.items.length > this.max) this.items.length = this.max;
    this.channel.publish(exchange);
    return exchange;
  }

  list(): Exchange[] {
    return [...this.items];
  }
}
