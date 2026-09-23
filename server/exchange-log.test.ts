import { describe, expect, it } from 'vitest';
import { ExchangeLog, redactBody, redactHeaders, type Exchange } from './exchange-log';
import { SseChannel } from './sse';

const base = {
  method: 'GET',
  path: '/health',
  query: {},
  requestHeaders: {},
  requestBody: null,
  status: 200,
  responseHeaders: {},
  responseBody: { status: 'ok' },
  durationMs: 12,
};

describe('redactHeaders', () => {
  it('masks Authorization regardless of case and keeps the rest', () => {
    expect(redactHeaders({ Authorization: 'Bearer abc', 'X-Request-Id': 'r1' })).toEqual({
      Authorization: 'Bearer ****',
      'X-Request-Id': 'r1',
    });
    expect(redactHeaders({ authorization: 'Bearer abc' })).toEqual({ authorization: 'Bearer ****' });
  });
  it('masks a scheme-less Authorization value entirely', () => {
    expect(redactHeaders({ Authorization: 'abc123' })).toEqual({ Authorization: '****' });
  });
});

describe('redactBody', () => {
  it('masks client_secret in a JSON object and leaves other values', () => {
    expect(redactBody({ grant_type: 'client_credentials', client_secret: 's3cret' })).toEqual({
      grant_type: 'client_credentials',
      client_secret: '****',
    });
  });
  it('returns non-objects untouched', () => {
    expect(redactBody(null)).toBeNull();
    expect(redactBody('text')).toBe('text');
  });
});

describe('ExchangeLog', () => {
  it('assigns id and timestamp, redacts, publishes and lists newest first', () => {
    const published: Exchange[] = [];
    const channel = new SseChannel<Exchange>();
    channel.publish = (data) => {
      published.push(data);
    };
    const log = new ExchangeLog(channel, 2);
    const first = log.record({ ...base, requestHeaders: { Authorization: 'Bearer x' } });
    expect(first.id).toMatch(/[0-9a-f-]{36}/);
    expect(first.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.requestHeaders.Authorization).toBe('Bearer ****');
    log.record({ ...base, path: '/vehicles' });
    log.record({ ...base, path: '/bookings' });
    expect(log.list().map((e) => e.path)).toEqual(['/bookings', '/vehicles']);
    expect(published).toHaveLength(3);
  });
});
