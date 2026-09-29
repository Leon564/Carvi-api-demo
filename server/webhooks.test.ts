import { describe, expect, it } from 'vitest';
import { computeSignature } from './signature';
import { SseChannel } from './sse';
import { evaluateDelivery, EventStore, parsePayload, type DeliveryInput, type ReceivedEvent } from './webhooks';

const rawBody = JSON.stringify({ eventId: 'evt_1', type: 'booking.confirmed' });
const now = 1_700_000_000;
const ts = String(now);
const validSig = `sha256=${computeSignature('s1', ts, rawBody)}`;

function deliver(overrides: Partial<DeliveryInput>) {
  return evaluateDelivery({ secrets: [], authToken: '', timestamp: ts, rawBody, nowSeconds: now, ...overrides });
}

describe('evaluateDelivery: signature', () => {
  it('secrets + valid signature → VALID, 200', () => {
    expect(deliver({ secrets: ['s1'], signatureHeader: validSig })).toEqual({
      signatureStatus: 'VALID',
      authStatus: 'NOT_REQUIRED',
      accepted: true,
      httpStatus: 200,
    });
  });
  it('secrets + tampered signature → INVALID/MISMATCH, 401', () => {
    expect(deliver({ secrets: ['s1'], signatureHeader: validSig, rawBody: rawBody + ' ' })).toEqual({
      signatureStatus: 'INVALID',
      reason: 'MISMATCH',
      authStatus: 'NOT_REQUIRED',
      accepted: false,
      httpStatus: 401,
      errorCode: 'INVALID_SIGNATURE',
    });
  });
  it('secrets + stale signature → INVALID/STALE, 401', () => {
    const d = deliver({ secrets: ['s1'], signatureHeader: validSig, nowSeconds: now + 301 });
    expect(d).toMatchObject({ signatureStatus: 'INVALID', reason: 'STALE', accepted: false, httpStatus: 401, errorCode: 'INVALID_SIGNATURE' });
  });
  it('secrets + no signature header → INVALID/NO_SIGNATURE, 401', () => {
    const d = deliver({ secrets: ['s1'] });
    expect(d).toMatchObject({ signatureStatus: 'INVALID', reason: 'NO_SIGNATURE', accepted: false, httpStatus: 401, errorCode: 'INVALID_SIGNATURE' });
  });
  it('no secrets + no signature header → UNSIGNED, 200', () => {
    expect(deliver({})).toEqual({ signatureStatus: 'UNSIGNED', authStatus: 'NOT_REQUIRED', accepted: true, httpStatus: 200 });
  });
  it('no secrets + signature header → UNVERIFIED/NO_SECRETS, 200', () => {
    expect(deliver({ signatureHeader: validSig })).toEqual({
      signatureStatus: 'UNVERIFIED',
      reason: 'NO_SECRETS',
      authStatus: 'NOT_REQUIRED',
      accepted: true,
      httpStatus: 200,
    });
  });
});

describe('evaluateDelivery: auth token', () => {
  it('no token configured → NOT_REQUIRED whatever the header', () => {
    expect(deliver({ authorizationHeader: 'Bearer anything' })).toMatchObject({ authStatus: 'NOT_REQUIRED', accepted: true, httpStatus: 200 });
    expect(deliver({})).toMatchObject({ authStatus: 'NOT_REQUIRED', accepted: true });
  });
  it('matching Bearer token → VALID, 200', () => {
    expect(deliver({ authToken: 'tok', authorizationHeader: 'Bearer tok' })).toEqual({
      signatureStatus: 'UNSIGNED',
      authStatus: 'VALID',
      accepted: true,
      httpStatus: 200,
    });
  });
  it('missing Authorization → MISSING, 401 INVALID_AUTH_TOKEN', () => {
    expect(deliver({ authToken: 'tok' })).toEqual({
      signatureStatus: 'UNSIGNED',
      authStatus: 'MISSING',
      accepted: false,
      httpStatus: 401,
      errorCode: 'INVALID_AUTH_TOKEN',
    });
  });
  it('different token → INVALID, 401 INVALID_AUTH_TOKEN', () => {
    for (const authorizationHeader of ['Bearer other', 'Bearer tokk', 'tok', 'Basic tok']) {
      expect(deliver({ authToken: 'tok', authorizationHeader })).toMatchObject({
        authStatus: 'INVALID',
        accepted: false,
        httpStatus: 401,
        errorCode: 'INVALID_AUTH_TOKEN',
      });
    }
  });
  it('valid signature and valid token → accepted', () => {
    const d = deliver({ secrets: ['s1'], signatureHeader: validSig, authToken: 'tok', authorizationHeader: 'Bearer tok' });
    expect(d).toEqual({ signatureStatus: 'VALID', authStatus: 'VALID', accepted: true, httpStatus: 200 });
  });
  it('the signature error wins when both checks fail', () => {
    const d = deliver({ secrets: ['s1'], authToken: 'tok', authorizationHeader: 'Bearer nope' });
    expect(d).toMatchObject({ signatureStatus: 'INVALID', authStatus: 'INVALID', httpStatus: 401, errorCode: 'INVALID_SIGNATURE' });
  });
  it('a valid signature with a missing token is still rejected', () => {
    const d = deliver({ secrets: ['s1'], signatureHeader: validSig, authToken: 'tok' });
    expect(d).toMatchObject({ signatureStatus: 'VALID', authStatus: 'MISSING', accepted: false, errorCode: 'INVALID_AUTH_TOKEN' });
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
    authStatus: 'NOT_REQUIRED' as const,
    accepted: true,
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
  it('does not let a delivery rejected by signature poison the dedupe of a later valid retry', () => {
    const store = new EventStore(new SseChannel<ReceivedEvent>());
    const rejected = store.record({ ...input, eventId: 'evt_x', signatureStatus: 'INVALID', reason: 'MISMATCH', accepted: false });
    expect(rejected.duplicate).toBe(false);
    expect(store.record({ ...input, eventId: 'evt_x' }).duplicate).toBe(false);
    expect(store.record({ ...input, eventId: 'evt_x' }).duplicate).toBe(true);
  });
  it('does not let a delivery rejected by token poison the dedupe either', () => {
    const store = new EventStore(new SseChannel<ReceivedEvent>());
    store.record({ ...input, eventId: 'evt_y', authStatus: 'MISSING', accepted: false });
    store.record({ ...input, eventId: 'evt_y', authStatus: 'INVALID', accepted: false });
    expect(store.record({ ...input, eventId: 'evt_y', authStatus: 'VALID' }).duplicate).toBe(false);
  });
});
