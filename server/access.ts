import { randomUUID } from 'node:crypto';
import type express from 'express';
import { localOnly } from './local-only';
import { envelope } from './proxy';
import { safeEqual } from './signature';

/** Password of an `Authorization: Basic` header; the user name is ignored. */
function passwordFrom(header: string | undefined): string | null {
  const match = /^Basic\s+(.+)$/i.exec(header ?? '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon === -1 ? null : decoded.slice(colon + 1);
}

/** Requires HTTP Basic credentials with the given password; the browser prompts for them once. */
export function basicAuth(password: string): express.RequestHandler {
  return (req, res, next) => {
    const given = passwordFrom(req.header('Authorization'));
    if (given !== null && safeEqual(given, password)) {
      next();
      return;
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Carvi demo", charset="UTF-8"');
    res.status(401).json(envelope('UNAUTHORIZED', 'El demo está protegido con contraseña', randomUUID()));
  };
}

/**
 * Gate for everything except /webhooks/carvi. Without a password the server stays local-only;
 * with one it can be published (the proxy acts with the partner credential, so it must never be
 * reachable unauthenticated) and every request has to carry the password.
 */
export function accessGuard(password: string): express.RequestHandler {
  return password ? basicAuth(password) : localOnly();
}
