import { randomUUID } from 'node:crypto';
import { raw, Router } from 'express';
import { safeEqual, verifySignature, type SignatureReason } from './signature';
import type { SseChannel } from './sse';

export type SignatureStatus = 'VALID' | 'INVALID' | 'UNSIGNED' | 'UNVERIFIED';
export type AuthStatus = 'VALID' | 'INVALID' | 'MISSING' | 'NOT_REQUIRED';
export type DeliveryErrorCode = 'INVALID_SIGNATURE' | 'INVALID_AUTH_TOKEN';

export interface ReceivedEvent {
  id: string;
  receivedAt: string;
  type: string;
  eventId: string;
  keyId: string;
  timestamp: string;
  signatureStatus: SignatureStatus;
  reason?: SignatureReason;
  authStatus: AuthStatus;
  /** True when the delivery was answered with 200. */
  accepted: boolean;
  duplicate: boolean;
  payload: unknown;
  headers: Record<string, string>;
}

export type ReceivedEventInput = Omit<ReceivedEvent, 'id' | 'receivedAt' | 'duplicate'>;

export interface DeliveryInput {
  secrets: string[];
  authToken: string;
  timestamp?: string;
  signatureHeader?: string;
  authorizationHeader?: string;
  rawBody: string;
  nowSeconds?: number;
}

export interface DeliveryDecision {
  signatureStatus: SignatureStatus;
  reason?: SignatureReason;
  authStatus: AuthStatus;
  accepted: boolean;
  httpStatus: 200 | 401;
  errorCode?: DeliveryErrorCode;
}

function evaluateSignature(input: DeliveryInput): { signatureStatus: SignatureStatus; reason?: SignatureReason } {
  const hasHeader = !!input.signatureHeader;
  if (input.secrets.length === 0) {
    // Nothing to verify against: an unsigned delivery is expected (credential without secret),
    // a signed one simply cannot be checked.
    return hasHeader ? { signatureStatus: 'UNVERIFIED', reason: 'NO_SECRETS' } : { signatureStatus: 'UNSIGNED' };
  }
  const result = verifySignature(input.secrets, input.timestamp || undefined, input.rawBody, input.signatureHeader || undefined, input.nowSeconds);
  return result.valid ? { signatureStatus: 'VALID' } : { signatureStatus: 'INVALID', reason: result.reason };
}

function evaluateAuth(authToken: string, authorizationHeader: string | undefined): AuthStatus {
  if (!authToken) return 'NOT_REQUIRED';
  if (!authorizationHeader) return 'MISSING';
  return safeEqual(authorizationHeader, `Bearer ${authToken}`) ? 'VALID' : 'INVALID';
}

/** Pure decision for one webhook delivery: signature and bearer token are checked independently. */
export function evaluateDelivery(input: DeliveryInput): DeliveryDecision {
  const { signatureStatus, reason } = evaluateSignature(input);
  const authStatus = evaluateAuth(input.authToken, input.authorizationHeader);
  const signatureFailed = signatureStatus === 'INVALID';
  const authFailed = authStatus === 'MISSING' || authStatus === 'INVALID';
  const accepted = !signatureFailed && !authFailed;
  const decision: DeliveryDecision = { signatureStatus, authStatus, accepted, httpStatus: accepted ? 200 : 401 };
  if (reason) decision.reason = reason;
  // The signature wins when both checks fail.
  if (signatureFailed) decision.errorCode = 'INVALID_SIGNATURE';
  else if (authFailed) decision.errorCode = 'INVALID_AUTH_TOKEN';
  return decision;
}

export function parsePayload(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** In-memory list of received deliveries, newest first, deduplicated by eventId (flag only). */
export class EventStore {
  private readonly items: ReceivedEvent[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly channel: SseChannel<ReceivedEvent>,
    private readonly max = 200,
  ) {}

  record(input: ReceivedEventInput): ReceivedEvent {
    const duplicate = input.eventId !== '' && this.seen.has(input.eventId);
    // A rejected delivery must not poison the dedupe set, or Carvi's valid retry of the same
    // event would be flagged as a duplicate.
    if (input.eventId && input.accepted) this.seen.add(input.eventId);
    const event: ReceivedEvent = { ...input, id: randomUUID(), receivedAt: new Date().toISOString(), duplicate };
    this.items.unshift(event);
    if (this.items.length > this.max) this.items.length = this.max;
    this.channel.publish(event);
    return event;
  }

  list(): ReceivedEvent[] {
    return [...this.items];
  }
}

const ECHOED_HEADERS = ['x-carvi-event', 'x-carvi-event-id', 'x-carvi-timestamp', 'x-carvi-signature', 'x-carvi-key-id', 'x-request-id', 'user-agent'];

export function createWebhookRouter(secrets: string[], authToken: string, store: EventStore): Router {
  const router = Router();
  // Raw body: the signature covers the bytes exactly as sent, never a re-serialisation.
  router.post('/carvi', raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const header = (name: string) => req.header(name) ?? '';
    const decision = evaluateDelivery({
      secrets,
      authToken,
      timestamp: header('X-Carvi-Timestamp') || undefined,
      signatureHeader: header('X-Carvi-Signature') || undefined,
      authorizationHeader: header('Authorization') || undefined,
      rawBody,
    });
    const payload = parsePayload(rawBody);
    const fromPayload = (key: string) => (isRecord(payload) && typeof payload[key] === 'string' ? (payload[key] as string) : '');
    const headers: Record<string, string> = {};
    // Only headers that actually arrived: an absent `X-Carvi-Signature` must not show up as "".
    for (const name of ECHOED_HEADERS) if (header(name)) headers[name] = header(name);
    // Never echo the real token.
    if (header('Authorization')) headers.authorization = 'Bearer ****';
    store.record({
      type: header('X-Carvi-Event') || fromPayload('type') || 'unknown',
      eventId: header('X-Carvi-Event-Id') || fromPayload('eventId'),
      keyId: header('X-Carvi-Key-Id'),
      timestamp: header('X-Carvi-Timestamp'),
      signatureStatus: decision.signatureStatus,
      reason: decision.reason,
      authStatus: decision.authStatus,
      accepted: decision.accepted,
      payload,
      headers,
    });
    if (!decision.accepted) {
      res.status(401).json({ error: decision.errorCode, reason: decision.reason });
      return;
    }
    res.status(200).json({ received: true });
  });
  return router;
}
