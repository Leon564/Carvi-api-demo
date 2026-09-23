import { randomUUID } from 'node:crypto';
import { raw, Router } from 'express';
import { verifySignature, type SignatureReason, type SignatureResult } from './signature';
import type { SseChannel } from './sse';

export type SignatureStatus = 'VALID' | 'INVALID' | 'UNVERIFIED';

export interface ReceivedEvent {
  id: string;
  receivedAt: string;
  type: string;
  eventId: string;
  keyId: string;
  timestamp: string;
  signatureStatus: SignatureStatus;
  reason?: SignatureReason;
  duplicate: boolean;
  payload: unknown;
  headers: Record<string, string>;
}

export type ReceivedEventInput = Omit<ReceivedEvent, 'id' | 'receivedAt' | 'duplicate'>;

export function classifySignature(result: SignatureResult): SignatureStatus {
  if (result.valid) return 'VALID';
  return result.reason === 'NO_SECRETS' ? 'UNVERIFIED' : 'INVALID';
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
    if (input.eventId && input.signatureStatus !== 'INVALID') this.seen.add(input.eventId);
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

export function createWebhookRouter(secrets: string[], store: EventStore): Router {
  const router = Router();
  // Raw body: the signature covers the bytes exactly as sent, never a re-serialisation.
  router.post('/carvi', raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const header = (name: string) => req.header(name) ?? '';
    const result = verifySignature(secrets, header('X-Carvi-Timestamp') || undefined, rawBody, header('X-Carvi-Signature') || undefined);
    const signatureStatus = classifySignature(result);
    const payload = parsePayload(rawBody);
    const fromPayload = (key: string) => (isRecord(payload) && typeof payload[key] === 'string' ? (payload[key] as string) : '');
    const headers: Record<string, string> = {};
    for (const name of ECHOED_HEADERS) headers[name] = header(name);
    store.record({
      type: header('X-Carvi-Event') || fromPayload('type') || 'unknown',
      eventId: header('X-Carvi-Event-Id') || fromPayload('eventId'),
      keyId: header('X-Carvi-Key-Id'),
      timestamp: header('X-Carvi-Timestamp'),
      signatureStatus,
      reason: result.reason,
      payload,
      headers,
    });
    if (signatureStatus === 'INVALID') {
      res.status(401).json({ error: 'INVALID_SIGNATURE', reason: result.reason });
      return;
    }
    res.status(200).json({ received: true });
  });
  return router;
}
