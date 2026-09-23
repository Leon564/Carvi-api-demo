import 'dotenv/config';

export interface ServerConfig {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecrets: string[];
  port: number;
  publicWebhookUrl: string;
}

const REQUIRED = ['CARVI_CLIENT_ID', 'CARVI_CLIENT_SECRET'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const port = Number(env.PORT ?? 4020);
  return {
    apiBaseUrl: (env.CARVI_API_BASE_URL ?? 'http://localhost:3999/integrations/v1').replace(/\/+$/, ''),
    clientId: env.CARVI_CLIENT_ID as string,
    clientSecret: env.CARVI_CLIENT_SECRET as string,
    webhookSecrets: (env.CARVI_WEBHOOK_SECRETS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    port,
    publicWebhookUrl: env.PUBLIC_WEBHOOK_URL ?? `http://localhost:${port}/webhooks/carvi`,
  };
}
