#!/usr/bin/env node
// Sends one booking.confirmed delivery to the local demo server.
//   node scripts/send-test-webhook.mjs [--unsigned] [--secret <s>] [--token <t>] [--url <u>]
// Without --unsigned it signs with --secret, else the first CARVI_WEBHOOK_SECRETS entry, else 'demo-secret'.
// With --token (or CARVI_WEBHOOK_AUTH_TOKEN) it adds `Authorization: Bearer <token>`.
import { createHmac, randomUUID } from 'node:crypto';

const USAGE = 'Usage: node scripts/send-test-webhook.mjs [--unsigned] [--secret <s>] [--token <t>] [--url <u>]';

function parseArgs(argv) {
  const opts = { unsigned: false, secret: undefined, token: undefined, url: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--unsigned') {
      opts.unsigned = true;
    } else if (arg === '--secret' || arg === '--token' || arg === '--url') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      opts[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  console.error(USAGE);
  process.exit(1);
}

const firstEnvSecret = (process.env.CARVI_WEBHOOK_SECRETS ?? '')
  .split(',')
  .map((s) => s.trim())
  .find(Boolean);
const secret = opts.secret ?? firstEnvSecret ?? 'demo-secret';
const token = opts.token ?? (process.env.CARVI_WEBHOOK_AUTH_TOKEN?.trim() || undefined);
const url = opts.url ?? 'http://localhost:4020/webhooks/carvi';

const eventId = `evt_${randomUUID().slice(0, 8)}`;
const body = JSON.stringify({
  eventId,
  type: 'booking.confirmed',
  occurredAt: new Date().toISOString(),
  data: {
    bookingId: 'demo',
    externalReference: 'TEST-1',
    confirmationCode: 'CV-TEST01',
    status: 'CONFIRMED',
    booking: { id: 'demo', status: 'CONFIRMED', metadata: { crmId: 'CRM-1042', vip: true } },
  },
});
const timestamp = String(Math.floor(Date.now() / 1000));

const headers = {
  'Content-Type': 'application/json',
  'X-Carvi-Event': 'booking.confirmed',
  'X-Carvi-Event-Id': eventId,
  'X-Carvi-Timestamp': timestamp,
  'X-Carvi-Key-Id': 'demo-client',
  'X-Request-Id': randomUUID(),
  'User-Agent': 'Carvi-Webhooks/1',
};
if (!opts.unsigned) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  headers['X-Carvi-Signature'] = `sha256=${signature}`;
}
if (token) headers.Authorization = `Bearer ${token}`;

const mode = opts.unsigned ? 'unsigned' : 'signed';
console.log(`POST ${url} (${mode}${token ? ', bearer token' : ''})`);
const res = await fetch(url, { method: 'POST', headers, body });
console.log(res.status, await res.text());
