import { randomUUID } from 'node:crypto';
import { UpstreamError } from './errors';
import type { ExchangeLog } from './exchange-log';
import type { TokenManager } from './token-manager';

export interface CarviRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  idempotencyKey?: string;
}

export interface CarviResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Response headers the browser needs to see (the technical panel shows them). */
export const FORWARDED_RESPONSE_HEADERS = ['x-request-id', 'idempotent-replayed', 'retry-after', 'cache-control'] as const;

export function errorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { code?: unknown } }).error;
    if (error && typeof error.code === 'string') return error.code;
  }
  return undefined;
}

export function pickHeaders(headers: Headers, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) out[name] = value;
  }
  return out;
}

export async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Authenticated HTTP client for /integrations/v1; every exchange is recorded. */
export class CarviClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly tokens: TokenManager,
    private readonly log: ExchangeLog,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async call(req: CarviRequest): Promise<CarviResponse> {
    const first = await this.send(req);
    if (first.status === 401 && errorCode(first.body) === 'INVALID_TOKEN') {
      this.tokens.invalidate();
      return this.send(req);
    }
    return first;
  }

  private async send(req: CarviRequest): Promise<CarviResponse> {
    const requestId = randomUUID();
    const token = await this.tokens.getToken();
    const url = new URL(`${this.apiBaseUrl}${req.path}`);
    for (const [key, value] of Object.entries(req.query ?? {})) url.searchParams.set(key, value);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-Request-Id': requestId };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;
    const query = req.query ?? {};
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(url, { method: req.method, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.record({ method: req.method, path: req.path, query, requestHeaders: headers, requestBody: req.body ?? null, status: 0, responseHeaders: {}, responseBody: { error: message }, durationMs: Date.now() - started });
      throw new UpstreamError(message, requestId);
    }
    const body = await readJsonBody(res);
    const responseHeaders = pickHeaders(res.headers, FORWARDED_RESPONSE_HEADERS);
    this.log.record({ method: req.method, path: req.path, query, requestHeaders: headers, requestBody: req.body ?? null, status: res.status, responseHeaders, responseBody: body, durationMs: Date.now() - started });
    return { status: res.status, headers: responseHeaders, body };
  }
}
