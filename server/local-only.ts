import { randomUUID } from 'node:crypto';
import type express from 'express';
import { envelope } from './proxy';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Rejects requests whose Host header is not local. A tunnel (e.g. ngrok) forwards the public
 * Host it received, so only /webhooks/carvi — mounted outside this middleware — should be
 * reachable through one; everything else stays local to this machine.
 */
export function localOnly(): express.RequestHandler {
  return (req, res, next) => {
    if (LOCAL_HOSTNAMES.has(req.hostname)) {
      next();
      return;
    }
    const requestId = randomUUID();
    res.status(403).json(envelope('FORBIDDEN', 'El servidor del demo solo acepta peticiones locales', requestId));
  };
}
