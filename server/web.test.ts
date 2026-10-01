import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createWebRouter } from './web';

function startApp(dir: string): Promise<{ server: Server; base: string }> {
  const app = express();
  app.get('/api/ping', (_req, res) => res.status(200).json({ ok: true }));
  app.use(createWebRouter(dir));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function builtFrontEnd(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'demo-web-'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>demo</title>');
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
  return dir;
}

describe('createWebRouter', () => {
  let server: Server | undefined;
  let dir: string | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('serves index.html at the root and for client-side routes', async () => {
    dir = builtFrontEnd();
    const started = await startApp(dir);
    server = started.server;
    for (const route of ['/', '/reservas', '/vehiculos/abc123', '/webhooks']) {
      const res = await fetch(`${started.base}${route}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<title>demo</title>');
    }
  });

  it('serves built assets and keeps missing ones as 404', async () => {
    dir = builtFrontEnd();
    const started = await startApp(dir);
    server = started.server;
    const asset = await fetch(`${started.base}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('console.log(1)');
    expect((await fetch(`${started.base}/assets/missing.js`)).status).toBe(404);
  });

  it('does not answer server routes with the app shell', async () => {
    dir = builtFrontEnd();
    const started = await startApp(dir);
    server = started.server;
    expect((await fetch(`${started.base}/api/ping`)).status).toBe(200);
    expect((await fetch(`${started.base}/api/unknown`)).status).toBe(404);
    expect((await fetch(`${started.base}/webhooks/other`)).status).toBe(404);
  });

  it('does nothing when the front end has not been built', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'demo-web-'));
    const started = await startApp(dir);
    server = started.server;
    expect((await fetch(`${started.base}/`)).status).toBe(404);
  });
});
