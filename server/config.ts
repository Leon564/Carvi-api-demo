import 'dotenv/config';

export interface ServerConfig {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecrets: string[];
  /** Token Carvi must send as `Authorization: Bearer <token>`; empty = not required. */
  webhookAuthToken: string;
  /** Interface to bind; hosting platforms need `0.0.0.0` to route traffic to the server. */
  host: string;
  port: number;
  publicWebhookUrl: string;
}

const REQUIRED = ['CARVI_CLIENT_ID', 'CARVI_CLIENT_SECRET'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const port = Number(env.PORT ?? 4020);
  return {
    apiBaseUrl: (env.CARVI_API_BASE_URL ?? 'http://localhost:3000/integrations/v1').replace(/\/+$/, ''),
    clientId: env.CARVI_CLIENT_ID as string,
    clientSecret: env.CARVI_CLIENT_SECRET as string,
    webhookSecrets: (env.CARVI_WEBHOOK_SECRETS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    webhookAuthToken: (env.CARVI_WEBHOOK_AUTH_TOKEN ?? '').trim(),
    host: (env.HOST ?? '').trim() || '127.0.0.1',
    port,
    publicWebhookUrl: env.PUBLIC_WEBHOOK_URL ?? `http://localhost:${port}/webhooks/carvi`,
  };
}
