import { randomUUID } from 'node:crypto';
import { TokenError, UpstreamError } from './errors';
import type { ExchangeInput } from './exchange-log';

export interface TokenManagerDeps {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  onExchange?: (exchange: ExchangeInput) => void;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

const DEFAULT_TTL_SECONDS = 900;
const RENEW_MARGIN_MS = 60_000;

/** Caches the client-credentials token and renews it shortly before it expires. */
export class TokenManager {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly deps: TokenManagerDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  async getToken(): Promise<string> {
    if (this.token && this.expiresAt - this.now() > RENEW_MARGIN_MS) return this.token;
    if (!this.inflight) {
      this.inflight = this.request().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async request(): Promise<string> {
    const requestId = randomUUID();
    const body = { grant_type: 'client_credentials', client_id: this.deps.clientId, client_secret: this.deps.clientSecret };
    // Never let the secret reach the log, even before ExchangeLog redacts.
    const loggedBody = { ...body, client_secret: '****' };
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Request-Id': requestId };
    const started = this.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.deps.apiBaseUrl}/auth/token`, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.onExchange?.({ method: 'POST', path: '/auth/token', query: {}, requestHeaders: headers, requestBody: loggedBody, status: 0, responseHeaders: {}, responseBody: { error: message }, durationMs: this.now() - started });
      throw new UpstreamError(message, requestId);
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    // Never let the access token reach the log, even before ExchangeLog redacts.
    const loggedResponseBody =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof (parsed as { access_token?: unknown }).access_token === 'string'
        ? { ...(parsed as Record<string, unknown>), access_token: '****' }
        : parsed;
    this.deps.onExchange?.({
      method: 'POST',
      path: '/auth/token',
      query: {},
      requestHeaders: headers,
      requestBody: loggedBody,
      status: res.status,
      responseHeaders: { 'x-request-id': res.headers.get('x-request-id') ?? requestId },
      responseBody: loggedResponseBody,
      durationMs: this.now() - started,
    });
    if (!res.ok) throw new TokenError(res.status, parsed);
    const data = parsed as TokenResponse;
    this.token = data.access_token;
    this.expiresAt = this.now() + (data.expires_in ?? DEFAULT_TTL_SECONDS) * 1000;
    return this.token;
  }
}
