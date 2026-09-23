import { describe, expect, it } from 'vitest';
import { computeSignature, parseSignatureHeader, verifySignature } from './signature';

const body = JSON.stringify({ eventId: 'evt_1', type: 'booking.confirmed' });
const now = 1_700_000_000;
const ts = String(now);

describe('parseSignatureHeader', () => {
  it('splits by comma and strips the sha256= prefix', () => {
    expect(parseSignatureHeader('sha256=aaa, sha256=bbb')).toEqual(['aaa', 'bbb']);
  });
  it('returns an empty list for a missing header', () => {
    expect(parseSignatureHeader(undefined)).toEqual([]);
    expect(parseSignatureHeader('')).toEqual([]);
  });
});

describe('verifySignature', () => {
  it('accepts a single valid signature', () => {
    const sig = `sha256=${computeSignature('s1', ts, body)}`;
    expect(verifySignature(['s1'], ts, body, sig, now)).toEqual({ valid: true });
  });
  it('accepts a double signature when only the old secret is known', () => {
    const sig = `sha256=${computeSignature('new', ts, body)},sha256=${computeSignature('old', ts, body)}`;
    expect(verifySignature(['old'], ts, body, sig, now)).toEqual({ valid: true });
  });
  it('accepts a double signature when only the new secret is known', () => {
    const sig = `sha256=${computeSignature('new', ts, body)},sha256=${computeSignature('old', ts, body)}`;
    expect(verifySignature(['new'], ts, body, sig, now)).toEqual({ valid: true });
  });
  it('reports NO_SECRETS when nothing is configured', () => {
    expect(verifySignature([], ts, body, 'sha256=x', now)).toEqual({ valid: false, reason: 'NO_SECRETS' });
  });
  it('reports NO_SIGNATURE when the header or timestamp is missing', () => {
    expect(verifySignature(['s1'], ts, body, undefined, now)).toEqual({ valid: false, reason: 'NO_SIGNATURE' });
    expect(verifySignature(['s1'], undefined, body, 'sha256=x', now)).toEqual({ valid: false, reason: 'NO_SIGNATURE' });
  });
  it('reports STALE when the timestamp is more than 300 s away or not numeric', () => {
    const sig = `sha256=${computeSignature('s1', ts, body)}`;
    expect(verifySignature(['s1'], ts, body, sig, now + 301)).toEqual({ valid: false, reason: 'STALE' });
    expect(verifySignature(['s1'], 'abc', body, sig, now)).toEqual({ valid: false, reason: 'STALE' });
  });
  it('reports MISMATCH when the body was altered', () => {
    const sig = `sha256=${computeSignature('s1', ts, body)}`;
    expect(verifySignature(['s1'], ts, body + ' ', sig, now)).toEqual({ valid: false, reason: 'MISMATCH' });
  });
  it('reports MISMATCH for a signature of a different length', () => {
    expect(verifySignature(['s1'], ts, body, 'sha256=abc', now)).toEqual({ valid: false, reason: 'MISMATCH' });
  });
});
