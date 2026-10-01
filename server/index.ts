import { fileURLToPath } from 'node:url';
import express from 'express';
import { accessGuard } from './access';
import { CarviClient } from './carvi-client';
import { loadConfig } from './config';
import { ExchangeLog, type Exchange } from './exchange-log';
import { createProxyRouter } from './proxy';
import { SseChannel } from './sse';
import { TokenManager } from './token-manager';
import { createWebRouter } from './web';
import { createWebhookRouter, EventStore, type ReceivedEvent } from './webhooks';

const config = loadConfig();

const exchangeChannel = new SseChannel<Exchange>();
const log = new ExchangeLog(exchangeChannel);
const tokens = new TokenManager({
  apiBaseUrl: config.apiBaseUrl,
  clientId: config.clientId,
  clientSecret: config.clientSecret,
  onExchange: (exchange) => log.record(exchange),
});
const client = new CarviClient(config.apiBaseUrl, tokens, log);

const eventChannel = new SseChannel<ReceivedEvent>();
const events = new EventStore(eventChannel);

const app = express();
app.disable('x-powered-by');

// Carvi authenticates its deliveries on its own (signature, bearer token), so the webhook
// endpoint sits in front of the access guard.
app.use('/webhooks', createWebhookRouter(config.webhookSecrets, config.webhookAuthToken, events));
app.use(accessGuard(config.accessPassword));
app.get('/api/config', (_req, res) => {
  res.json({
    apiBaseUrl: config.apiBaseUrl,
    clientId: config.clientId,
    webhookUrl: config.publicWebhookUrl,
    webhookSecretsConfigured: config.webhookSecrets.length,
    webhookAuthTokenConfigured: config.webhookAuthToken !== '',
  });
});
app.get('/api/log', (_req, res) => res.json(log.list()));
app.get('/api/log/stream', (_req, res) => exchangeChannel.subscribe(res));
app.get('/api/events', (_req, res) => res.json(events.list()));
app.get('/api/events/stream', (_req, res) => eventChannel.subscribe(res));
app.use('/api', express.json(), createProxyRouter(client));
// `dist` is a sibling of both `server/` (tsx) and `dist-server/` (bundle).
app.use(createWebRouter(fileURLToPath(new URL('../dist', import.meta.url))));

app.listen(config.port, config.host, () => {
  console.log(`[demo-socio] server on http://${config.host}:${config.port} → ${config.apiBaseUrl}`);
});
