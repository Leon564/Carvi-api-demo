import { describe, expect, it, vi } from 'vitest';
import { CarviClient, errorCode } from './carvi-client';
import { ExchangeLog, type Exchange } from './exchange-log';
import { SseChannel } from './sse';
import { TokenManager } from './token-manager';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void url;
    void init;
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  });
  const channel = new SseChannel<Exchange>();
  const log = new ExchangeLog(channel);
  const tokens = new TokenManager({ apiBaseUrl: 'http://carvi.test/v1', clientId: 'c', clientSecret: 's', fetchFn: fetchFn as unknown as typeof fetch });
  const client = new CarviClient('http://carvi.test/v1', tokens, log, fetchFn as unknown as typeof fetch);
  return { client, fetchFn, log };
}

const tokenOk = () => jsonResponse(201, { access_token: 'tok', token_type: 'Bearer', expires_in: 900 });

describe('CarviClient.call', () => {
  it('adds bearer, request id, idempotency key and query, and forwards selected headers', async () => {
    const { client, fetchFn, log } = setup([
      tokenOk,
      () => jsonResponse(201, { id: 'b1' }, { 'x-request-id': 'req-1', 'idempotent-replayed': 'true', 'retry-after': '3' }),
    ]);
    const res = await client.call({ method: 'POST', path: '/bookings', query: { page: '2' }, body: { quoteId: 'q' }, idempotencyKey: 'key-1' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'b1' });
    expect(res.headers).toMatchObject({ 'x-request-id': 'req-1', 'idempotent-replayed': 'true', 'retry-after': '3' });
    const [url, init] = fetchFn.mock.calls[1] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://carvi.test/v1/bookings?page=2');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(headers['X-Request-Id']).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(String(init.body))).toEqual({ quoteId: 'q' });
    expect(log.list()[0]).toMatchObject({ method: 'POST', path: '/bookings', status: 201, requestHeaders: { Authorization: 'Bearer ****' } });
  });
  it('retries once with a fresh token after 401 INVALID_TOKEN', async () => {
    const invalid = { error: { code: 'INVALID_TOKEN', message: 'expired', details: null, requestId: 'r' } };
    const { client, fetchFn } = setup([tokenOk, () => jsonResponse(401, invalid), tokenOk, () => jsonResponse(200, { status: 'ok' })]);
    const res = await client.call({ method: 'GET', path: '/health' });
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
  it('does not retry other 401s or 403s', async () => {
    const forbidden = { error: { code: 'FORBIDDEN', message: 'scope', details: null, requestId: 'r' } };
    const { client, fetchFn } = setup([tokenOk, () => jsonResponse(403, forbidden)]);
    const res = await client.call({ method: 'GET', path: '/vehicles' });
    expect(res.status).toBe(403);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('returns null body for an empty response', async () => {
    const { client } = setup([tokenOk, () => new Response(null, { status: 204 })]);
    const res = await client.call({ method: 'GET', path: '/x' });
    expect(res.body).toBeNull();
  });
  it('throws UpstreamError on a network failure and records the attempt', async () => {
    const { client, log } = setup([tokenOk, () => Promise.reject(new Error('ECONNREFUSED'))]);
    await expect(client.call({ method: 'GET', path: '/health' })).rejects.toMatchObject({ name: 'UpstreamError' });
    expect(log.list()[0]).toMatchObject({ path: '/health', status: 0 });
  });
});

describe('errorCode', () => {
  it('reads error.code from the envelope', () => {
    expect(errorCode({ error: { code: 'X' } })).toBe('X');
    expect(errorCode({ data: [] })).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});
