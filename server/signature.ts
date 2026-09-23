import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureReason = 'NO_SECRETS' | 'NO_SIGNATURE' | 'STALE' | 'MISMATCH';

export interface SignatureResult {
  valid: boolean;
  reason?: SignatureReason;
}

/** Deliveries older (or newer) than this are rejected to block replays. */
export const MAX_SKEW_SECONDS = 300;

/** `sha256=<hex>[,sha256=<hex>]` → list of hex digests (two during a secret rotation). */
export function parseSignatureHeader(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => part.trim().replace(/^sha256=/, ''))
    .filter(Boolean);
}

/** HMAC-SHA256(secret, "<timestamp>.<raw body>") in hex, exactly as Carvi signs. */
export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifySignature(
  secrets: string[],
  timestamp: string | undefined,
  rawBody: string,
  signatureHeader: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureResult {
  if (secrets.length === 0) return { valid: false, reason: 'NO_SECRETS' };
  const given = parseSignatureHeader(signatureHeader);
  if (given.length === 0 || !timestamp) return { valid: false, reason: 'NO_SIGNATURE' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
    return { valid: false, reason: 'STALE' };
  }
  for (const secret of secrets) {
    const expected = computeSignature(secret, timestamp, rawBody);
    if (given.some((candidate) => safeEqual(candidate, expected))) return { valid: true };
  }
  return { valid: false, reason: 'MISMATCH' };
}
