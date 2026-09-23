import { describe, expect, it, vi } from 'vitest';
import type { ExchangeInput } from './exchange-log';
import { TokenError } from './errors';
import { TokenManager } from './token-manager';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(responses: Array<() => Response | Promise<Response>>, start = 1_000_000) {
  let clock = start;
  const fetchFn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  });
  const exchanges: ExchangeInput[] = [];
  const manager = new TokenManager({
    apiBaseUrl: 'http://carvi.test/integrations/v1',
    clientId: 'cid',
    clientSecret: 'csecret',
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => clock,
    onExchange: (e) => exchanges.push(e),
  });
  return { manager, fetchFn, exchanges, advance: (ms: number) => (clock += ms) };
}

const token = (value: string, expiresIn = 900) => () =>
  jsonResponse(201, { access_token: value, token_type: 'Bearer', expires_in: expiresIn });

describe('TokenManager', () => {
  it('requests a token once and reuses it', async () => {
    const { manager, fetchFn } = setup([token('t1')]);
    expect(await manager.getToken()).toBe('t1');
    expect(await manager.getToken()).toBe('t1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://carvi.test/integrations/v1/auth/token');
    expect(JSON.parse(String(init.body))).toEqual({ grant_type: 'client_credentials', client_id: 'cid', client_secret: 'csecret' });
  });
  it('renews when less than 60 s remain', async () => {
    const { manager, fetchFn, advance } = setup([token('t1'), token('t2')]);
    await manager.getToken();
    advance(900_000 - 61_000);
    expect(await manager.getToken()).toBe('t1');
    advance(2_000);
    expect(await manager.getToken()).toBe('t2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('shares one in-flight request between concurrent callers', async () => {
    const { manager, fetchFn } = setup([token('t1')]);
    const [a, b] = await Promise.all([manager.getToken(), manager.getToken()]);
    expect(a).toBe('t1');
    expect(b).toBe('t1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('invalidate() forces a new request', async () => {
    const { manager, fetchFn } = setup([token('t1'), token('t2')]);
    await manager.getToken();
    manager.invalidate();
    expect(await manager.getToken()).toBe('t2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('falls back to 900 s when expires_in is missing', async () => {
    const { manager, fetchFn, advance } = setup([
      () => jsonResponse(201, { access_token: 't1', token_type: 'Bearer' }),
      token('t2'),
    ]);
    await manager.getToken();
    advance(800_000);
    expect(await manager.getToken()).toBe('t1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('throws TokenError with the upstream body on 401 and records the exchange with the secret masked', async () => {
    const body = { error: { code: 'INVALID_TOKEN', message: 'bad credentials', details: null, requestId: 'r' } };
    const { manager, exchanges } = setup([() => jsonResponse(401, body)]);
    const err = await manager.getToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenError);
    expect(err).toMatchObject({ status: 401, body });
    expect(exchanges[0]).toMatchObject({ method: 'POST', path: '/auth/token', status: 401 });
    expect((exchanges[0].requestBody as { client_secret: string }).client_secret).toBe('****');
  });
  it('masks the access token in the recorded exchange but keeps the real token in the cache', async () => {
    const { manager, exchanges } = setup([token('t1')]);
    const value = await manager.getToken();
    expect(value).toBe('t1');
    const exchange = exchanges[0].responseBody as { access_token: string; token_type: string };
    expect(exchange.access_token).toBe('****');
    expect(exchange.token_type).toBe('Bearer');
  });
  it('wraps a network failure in UpstreamError', async () => {
    const { manager } = setup([() => Promise.reject(new Error('ECONNREFUSED'))]);
    await expect(manager.getToken()).rejects.toMatchObject({ name: 'UpstreamError', message: 'ECONNREFUSED' });
  });
});
