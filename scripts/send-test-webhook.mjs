#!/usr/bin/env node
// Sends one signed booking.confirmed delivery to the local demo server.
//   node scripts/send-test-webhook.mjs [secret] [url]
import { createHmac, randomUUID } from 'node:crypto';

const secret = process.argv[2] ?? process.env.CARVI_WEBHOOK_SECRETS?.split(',')[0] ?? 'demo-secret';
const url = process.argv[3] ?? 'http://localhost:4020/webhooks/carvi';
const eventId = `evt_${randomUUID().slice(0, 8)}`;
const body = JSON.stringify({
  eventId,
  type: 'booking.confirmed',
  occurredAt: new Date().toISOString(),
  data: { bookingId: 'demo', externalReference: 'TEST-1', confirmationCode: 'CV-TEST01', status: 'CONFIRMED', booking: { id: 'demo', status: 'CONFIRMED' } },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Carvi-Event': 'booking.confirmed',
    'X-Carvi-Event-Id': eventId,
    'X-Carvi-Timestamp': timestamp,
    'X-Carvi-Signature': `sha256=${signature}`,
    'X-Carvi-Key-Id': 'demo-client',
    'X-Request-Id': randomUUID(),
    'User-Agent': 'Carvi-Webhooks/1',
  },
  body,
});
console.log(res.status, await res.text());
