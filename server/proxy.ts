import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { CarviClient } from './carvi-client';
import { TokenError, UpstreamError } from './errors';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export function toQuery(query: Request['query']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === 'string').join(',');
  }
  return out;
}

export function envelope(code: string, message: string, requestId: string) {
  return { error: { code, message, details: null, requestId } };
}

/**
 * `ALL /carvi/*` → Carvi `/integrations/v1/*`, same status and body, selected headers forwarded.
 * Error envelope `message` fields are shown to the user by the front end, so they are in Spanish
 * (the app's UI language), unlike the rest of this file's code and comments.
 */
export function createProxyRouter(client: CarviClient): Router {
  const router = Router();
  router.all('/carvi/*', async (req, res) => {
    // Router is mounted at /api, so req.path is "/carvi/<carvi path>".
    const path = req.path.replace(/^\/carvi/, '') || '/';
    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
    const body = METHODS_WITH_BODY.has(req.method) ? (req.body ?? {}) : undefined;
    try {
      const upstream = await client.call({ method: req.method, path, query: toQuery(req.query), body, idempotencyKey });
      for (const [name, value] of Object.entries(upstream.headers)) res.setHeader(name, value);
      res.status(upstream.status);
      if (upstream.body === null) res.end();
      else res.json(upstream.body);
    } catch (err) {
      if (err instanceof TokenError) {
        res.status(err.status).json(err.body ?? envelope('TOKEN_ERROR', `No se pudo obtener el token de Carvi (estado ${err.status})`, randomUUID()));
      } else if (err instanceof UpstreamError) {
        res.status(502).json(envelope('UPSTREAM_UNREACHABLE', `No se pudo conectar con la API de Carvi: ${err.message}`, err.requestId));
      } else {
        res.status(500).json(envelope('INTERNAL_ERROR', `Error inesperado del servidor del demo${err instanceof Error ? `: ${err.message}` : ''}`, randomUUID()));
      }
    }
  });
  return router;
}
