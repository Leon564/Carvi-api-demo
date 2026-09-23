import http, { type Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { localOnly } from './local-only';

function startApp(): Promise<{ server: Server; port: number }> {
  const app = express();
  app.use('/api', localOnly());
  app.get('/api/ping', (_req, res) => res.status(200).json({ ok: true }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// Node's global fetch (undici) treats Host as a forbidden header and always sets it to the
// connection target, so a raw http.request is used here to actually send a spoofed Host header
// the way a tunnel would.
function requestWithHost(port: number, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/ping', method: 'GET', headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('localOnly', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  it('rejects a request whose Host header is not local', async () => {
    const started = await startApp();
    server = started.server;
    const res = await requestWithHost(started.port, 'demo.ngrok.app');
    expect(res.status).toBe(403);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('passes through requests with the default local Host header', async () => {
    const started = await startApp();
    server = started.server;
    const res = await fetch(`http://127.0.0.1:${started.port}/api/ping`);
    expect(res.status).toBe(200);
  });
});
