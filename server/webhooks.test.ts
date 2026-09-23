import { describe, expect, it } from 'vitest';
import { SseChannel } from './sse';
import { classifySignature, EventStore, parsePayload, type ReceivedEvent } from './webhooks';

describe('classifySignature', () => {
  it('maps verification results to statuses', () => {
    expect(classifySignature({ valid: true })).toBe('VALID');
    expect(classifySignature({ valid: false, reason: 'NO_SECRETS' })).toBe('UNVERIFIED');
    expect(classifySignature({ valid: false, reason: 'MISMATCH' })).toBe('INVALID');
    expect(classifySignature({ valid: false, reason: 'STALE' })).toBe('INVALID');
  });
});

describe('parsePayload', () => {
  it('parses JSON and falls back to the raw string', () => {
    expect(parsePayload('{"a":1}')).toEqual({ a: 1 });
    expect(parsePayload('not json')).toBe('not json');
    expect(parsePayload('')).toBe('');
  });
});

describe('EventStore', () => {
  const input = {
    type: 'booking.confirmed',
    eventId: 'evt_1',
    keyId: 'cid',
    timestamp: '1',
    signatureStatus: 'VALID' as const,
    payload: { eventId: 'evt_1' },
    headers: {},
  };
  it('flags a repeated eventId as duplicate and still publishes it', () => {
    const published: ReceivedEvent[] = [];
    const channel = new SseChannel<ReceivedEvent>();
    channel.publish = (e) => {
      published.push(e);
    };
    const store = new EventStore(channel);
    expect(store.record(input).duplicate).toBe(false);
    expect(store.record(input).duplicate).toBe(true);
    expect(store.record({ ...input, eventId: '' }).duplicate).toBe(false);
    expect(published).toHaveLength(3);
    expect(store.list()[0].eventId).toBe('');
  });
  it('does not let a rejected delivery poison the dedupe of a later valid retry', () => {
    const channel = new SseChannel<ReceivedEvent>();
    const store = new EventStore(channel);
    const rejected = store.record({ ...input, eventId: 'evt_x', signatureStatus: 'INVALID' });
    expect(rejected.duplicate).toBe(false);
    const retried = store.record({ ...input, eventId: 'evt_x', signatureStatus: 'VALID' });
    expect(retried.duplicate).toBe(false);
    const again = store.record({ ...input, eventId: 'evt_x', signatureStatus: 'VALID' });
    expect(again.duplicate).toBe(true);
  });
});
