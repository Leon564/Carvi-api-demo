import http, { type Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { accessGuard } from './access';

function startApp(password: string): Promise<{ server: Server; port: number }> {
  const app = express();
  app.use(accessGuard(password));
  app.get('/api/ping', (_req, res) => res.status(200).json({ ok: true }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// Raw http.request so the Host header can be the public one a hosting platform forwards.
function request(port: number, headers: Record<string, string>): Promise<{ status: number; body: string; challenge?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/ping', method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, challenge: res.headers['www-authenticate'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('accessGuard', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('stays local-only when no password is configured', async () => {
    const started = await startApp('');
    server = started.server;
    expect((await request(started.port, { Host: 'demo.onrender.com' })).status).toBe(403);
    expect((await request(started.port, {})).status).toBe(200);
  });

  it('challenges requests without credentials when a password is configured', async () => {
    const started = await startApp('s3cret');
    server = started.server;
    // Local requests are challenged too: the Host header alone proves nothing once published.
    const res = await request(started.port, {});
    expect(res.status).toBe(401);
    expect(res.challenge).toContain('Basic');
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong password and a non-Basic scheme', async () => {
    const started = await startApp('s3cret');
    server = started.server;
    expect((await request(started.port, { Authorization: basic('demo', 'nope') })).status).toBe(401);
    expect((await request(started.port, { Authorization: 'Bearer s3cret' })).status).toBe(401);
  });

  it('lets a public request through with the right password, whatever the user name', async () => {
    const started = await startApp('s3:cret');
    server = started.server;
    const res = await request(started.port, { Host: 'demo.onrender.com', Authorization: basic('anyone', 's3:cret') });
    expect(res.status).toBe(200);
  });
});
