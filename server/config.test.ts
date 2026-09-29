import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('lists every missing required variable', () => {
    expect(() => loadConfig({})).toThrow('Missing environment variables: CARVI_CLIENT_ID, CARVI_CLIENT_SECRET');
  });
  it('applies defaults and parses the webhook secrets', () => {
    const cfg = loadConfig({ CARVI_CLIENT_ID: 'id', CARVI_CLIENT_SECRET: 'sec', CARVI_WEBHOOK_SECRETS: ' a , b ,' });
    expect(cfg).toEqual({
      apiBaseUrl: 'http://localhost:3000/integrations/v1',
      clientId: 'id',
      clientSecret: 'sec',
      webhookSecrets: ['a', 'b'],
      webhookAuthToken: '',
      port: 4020,
      publicWebhookUrl: 'http://localhost:4020/webhooks/carvi',
    });
  });
  it('reads and trims the webhook auth token', () => {
    const cfg = loadConfig({ CARVI_CLIENT_ID: 'id', CARVI_CLIENT_SECRET: 'sec', CARVI_WEBHOOK_AUTH_TOKEN: '  tok-123 ' });
    expect(cfg.webhookAuthToken).toBe('tok-123');
  });
  it('strips a trailing slash from the base URL and derives the webhook URL from PORT', () => {
    const cfg = loadConfig({ CARVI_CLIENT_ID: 'id', CARVI_CLIENT_SECRET: 'sec', CARVI_API_BASE_URL: 'https://x/integrations/v1/', PORT: '4100' });
    expect(cfg.apiBaseUrl).toBe('https://x/integrations/v1');
    expect(cfg.publicWebhookUrl).toBe('http://localhost:4100/webhooks/carvi');
  });
});
