import type { Server } from 'node:http';
import express, { type Request } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CarviClient } from './carvi-client';
import { TokenError, UpstreamError } from './errors';
import { createProxyRouter, envelope, toQuery } from './proxy';

describe('toQuery', () => {
  it('keeps strings, joins arrays with commas and drops objects', () => {
    const query = { page: '1', vehicleIds: ['a', 'b'], nested: { x: '1' } } as unknown as Request['query'];
    expect(toQuery(query)).toEqual({ page: '1', vehicleIds: 'a,b' });
  });
});

describe('envelope', () => {
  it('builds the Carvi error envelope', () => {
    expect(envelope('UPSTREAM_UNREACHABLE', 'down', 'r1')).toEqual({
      error: { code: 'UPSTREAM_UNREACHABLE', message: 'down', details: null, requestId: 'r1' },
    });
  });
});

describe('createProxyRouter', () => {
  const stub = { call: vi.fn() } as unknown as CarviClient;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use('/api', express.json(), createProxyRouter(stub));
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('expected an AddressInfo');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('passes a successful call through with status, body and forwarded headers', async () => {
    vi.mocked(stub.call).mockResolvedValueOnce({
      status: 201,
      headers: { 'x-request-id': 'r1', 'idempotent-replayed': 'true' },
      body: { id: 'b1' },
    });
    const res = await fetch(`${baseUrl}/api/carvi/bookings?page=2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k1' },
      body: JSON.stringify({ quoteId: 'q' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'b1' });
    expect(res.headers.get('x-request-id')).toBe('r1');
    expect(res.headers.get('idempotent-replayed')).toBe('true');
    expect(stub.call).toHaveBeenCalledWith({
      method: 'POST',
      path: '/bookings',
      query: { page: '2' },
      body: { quoteId: 'q' },
      idempotencyKey: 'k1',
    });
  });

  it('sends an empty body through as an empty response', async () => {
    vi.mocked(stub.call).mockResolvedValueOnce({ status: 204, headers: {}, body: null });
    const res = await fetch(`${baseUrl}/api/carvi/bookings/b1`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('forwards a TokenError body as-is when present', async () => {
    const body = { error: { code: 'INVALID_TOKEN', message: 'bad', details: null, requestId: 'r' } };
    vi.mocked(stub.call).mockRejectedValueOnce(new TokenError(401, body));
    const res = await fetch(`${baseUrl}/api/carvi/health`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(body);
  });

  it('builds a TOKEN_ERROR envelope in Spanish when TokenError has no body', async () => {
    vi.mocked(stub.call).mockRejectedValueOnce(new TokenError(429, null));
    const res = await fetch(`${baseUrl}/api/carvi/health`);
    expect(res.status).toBe(429);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('TOKEN_ERROR');
    expect(json.error.message).toContain('429');
  });

  it('maps UpstreamError to a 502 UPSTREAM_UNREACHABLE envelope', async () => {
    vi.mocked(stub.call).mockRejectedValueOnce(new UpstreamError('ECONNREFUSED', 'req-9'));
    const res = await fetch(`${baseUrl}/api/carvi/health`);
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string; requestId: string; message: string } };
    expect(json.error.code).toBe('UPSTREAM_UNREACHABLE');
    expect(json.error.requestId).toBe('req-9');
    expect(json.error.message.startsWith('No se pudo conectar')).toBe(true);
  });

  it('maps a generic error to a 500 INTERNAL_ERROR envelope', async () => {
    vi.mocked(stub.call).mockRejectedValueOnce(new Error('boom'));
    const res = await fetch(`${baseUrl}/api/carvi/health`);
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('INTERNAL_ERROR');
  });
});
