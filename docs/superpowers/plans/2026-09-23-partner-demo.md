# Partner Demo App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `demo-socio`, a React + Express demo that walks a partner through the whole Carvi `/integrations/v1` flow (token, health, catalog, availability, quote, booking, confirm, cancel, webhooks) with a guided UI, a live webhook feed and a raw HTTP panel.

**Architecture:** One npm package. `server/` is an Express app (TypeScript via `tsx`) that keeps the `client_secret`, caches the access token, proxies `/api/carvi/*` to Carvi, records every HTTP exchange, and receives signed webhooks; it publishes exchanges and events over SSE. `src/` is a Vite + React app that only talks to the local server (`/api`, proxied by Vite in dev). All server state is in memory.

**Tech Stack:** Node 20, Express 4, `tsx`, vitest, Vite 5, React 18, TypeScript 5.5 (`strict`), Tailwind 3.4, TanStack Query 5, react-router-dom 7, axios, react-hook-form + zod, sonner, lucide-react, date-fns.

**Spec:** `docs/superpowers/specs/2026-09-23-partner-demo-design.md`

## Global Constraints

- Repo: `E:\Dev\carvi\demo-socio`, branch `main`, git identity `carviapp <carvi.app2025@gmail.com>` (already configured).
- Code, comments, commit messages in **English**; UI copy and README in **Spanish**.
- Ports: web `5176`, server `4020`; Carvi default base URL `http://localhost:3999/integrations/v1`.
- Server env vars exactly: `CARVI_API_BASE_URL`, `CARVI_CLIENT_ID`, `CARVI_CLIENT_SECRET`, `CARVI_WEBHOOK_SECRETS`, `PORT`, `PUBLIC_WEBHOOK_URL`. `.env` is never committed.
- Error envelope from Carvi is forwarded untouched: `{ error: { code, message, details, requestId } }`. Server-originated errors use the same envelope with codes `UPSTREAM_UNREACHABLE`, `TOKEN_ERROR`, `INTERNAL_ERROR`.
- Idempotency: one UUID per **logical operation** (create booking, confirm, cancel), reused when the user repeats the request.
- Min rent: 5 calendar days inclusive (`to − from + 1 ≥ 5`); UI warns but never blocks sending.
- Verification of every task: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` all green. No UI tests; vitest only for pure server/lib logic.
- Commit after every task. End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Webhook body that is not JSON (or empty) must still be answered (200/401) and stored as a raw string, never crash the receiver. → test in Task 6 (`parsePayload`).
2. `X-Carvi-Timestamp` that is non-numeric or > 300 s away must be reported as `STALE`, not `MISMATCH`, and never throw. → tests in Task 2.
3. `Idempotent-Replayed` and `Retry-After` response headers must reach the browser through the proxy, otherwise the idempotency demo shows nothing. → test in Task 5 (`CarviClient` header forwarding).
4. A token response without `expires_in` (or a 401/429 on `/auth/token`) must not leave the manager in a broken state: fall back to 900 s, surface the upstream body. → tests in Task 4.
5. Calendar-day rule: `2026-10-10 → 2026-10-14` is 5 days (passes), `10 → 13` is 4 (warning), independent of hours. → test in Task 7 (`calendarDaysInclusive`).

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.server.json`, `vite.config.ts`, `eslint.config.js`, `postcss.config.js`, `tailwind.config.js`, `index.html`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `server/index.ts`
- Modify: `.gitignore` (already exists; add `.env` is already there — verify)

**Interfaces:**
- Produces: npm scripts `dev`, `dev:web`, `dev:server`, `build`, `lint`, `typecheck`, `test`; Vite proxy `/api` and `/webhooks` → `http://localhost:4020`; vitest picks `server/**/*.test.ts` and `src/**/*.test.ts`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "carvi-demo-socio",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -n web,server -c blue,green \"npm:dev:web\" \"npm:dev:server\"",
    "dev:web": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "vite build",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.app.json && tsc -p tsconfig.server.json",
    "test": "vitest run --passWithNoTests",
    "preview": "vite preview"
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.1",
    "@tanstack/react-query": "^5.81.5",
    "axios": "^1.10.0",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "lucide-react": "^0.344.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.62.0",
    "react-router-dom": "^7.6.3",
    "sonner": "^2.0.6",
    "tailwind-merge": "^3.3.1",
    "zod": "^4.0.15"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.1",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.18",
    "concurrently": "^9.1.0",
    "eslint": "^9.9.1",
    "eslint-plugin-react-hooks": "^5.1.0-rc.0",
    "eslint-plugin-react-refresh": "^0.4.11",
    "globals": "^15.9.0",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "tsx": "^4.19.0",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.3.0",
    "vite": "^5.4.2",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write the TypeScript configs**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`tsconfig.server.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["server"]
}
```

- [ ] **Step 3: Write Vite, ESLint, PostCSS and Tailwind configs**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    proxy: {
      // Everything the browser needs goes through the local demo server.
      '/api': 'http://localhost:4020',
      '/webhooks': 'http://localhost:4020',
    },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
```

`postcss.config.js`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { carvi: '#2fa8df' } } },
  plugins: [],
};
```

- [ ] **Step 4: Write the HTML shell, entry files and env example**

`index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Demo de socio · Carvi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-slate-50 text-slate-900 antialiased;
}
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx` (placeholder, replaced in Task 7):
```tsx
export default function App() {
  return <main className="p-8 text-lg">Demo de socio · Carvi</main>;
}
```

`server/index.ts` (placeholder, replaced in Task 5):
```ts
console.log('[demo-socio] server placeholder');
```

`.env.example`:
```
# URL base de la API de socios de Carvi (incluye /integrations/v1)
CARVI_API_BASE_URL=http://localhost:3999/integrations/v1
# Credencial creada desde el portal de integraciones
CARVI_CLIENT_ID=
CARVI_CLIENT_SECRET=
# Secretos de webhook separados por coma (dos durante una rotación). Vacío = entregas sin verificar
CARVI_WEBHOOK_SECRETS=
# Puerto del servidor local del demo
PORT=4020
# URL que hay que configurar como webhookUrl en el portal
PUBLIC_WEBHOOK_URL=http://localhost:4020/webhooks/carvi
```

- [ ] **Step 5: Install and verify the toolchain**

Run: `npm install && npm run lint && npm run typecheck && npm run build && npm test`
Expected: all exit 0; `npm test` prints "No test files found" and passes.

- [ ] **Step 6: Check `.gitignore` and commit**

Run: `grep -c "^.env$" .gitignore` → Expected `1`. Then:
```bash
git add -A
git commit -m "chore: scaffold Vite + React front and Express server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Webhook signature verification (pure)

**Files:**
- Create: `server/signature.ts`
- Test: `server/signature.test.ts`

**Interfaces:**
- Produces:
  - `type SignatureReason = 'NO_SECRETS' | 'NO_SIGNATURE' | 'STALE' | 'MISMATCH'`
  - `interface SignatureResult { valid: boolean; reason?: SignatureReason }`
  - `verifySignature(secrets: string[], timestamp: string | undefined, rawBody: string, signatureHeader: string | undefined, nowSeconds?: number): SignatureResult`
  - `computeSignature(secret: string, timestamp: string, rawBody: string): string` (hex)
  - `parseSignatureHeader(header: string | undefined): string[]`
  - `MAX_SKEW_SECONDS = 300`

- [ ] **Step 1: Write the failing tests**

`server/signature.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeSignature, parseSignatureHeader, verifySignature } from './signature';

const body = JSON.stringify({ eventId: 'evt_1', type: 'booking.confirmed' });
const now = 1_700_000_000;
const ts = String(now);

describe('parseSignatureHeader', () => {
  it('splits by comma and strips the sha256= prefix', () => {
    expect(parseSignatureHeader('sha256=aaa, sha256=bbb')).toEqual(['aaa', 'bbb']);
  });
  it('returns an empty list for a missing header', () => {
    expect(parseSignatureHeader(undefined)).toEqual([]);
    expect(parseSignatureHeader('')).toEqual([]);
  });
});

describe('verifySignature', () => {
  it('accepts a single valid signature', () => {
    const sig = `sha256=${computeSignature('s1', ts, body)}`;
    expect(verifySignature(['s1'], ts, body, sig, now)).toEqual({ valid: true });
  });
  it('accepts a double signature when only the old secret is known', () => {
    const sig = `sha256=${computeSignature('new', ts, body)},sha256=${computeSignature('old', ts, body)}`;
    expect(verifySignature(['old'], ts, body, sig, now)).toEqual({ valid: true });
  });
  it('accepts a double signature when only the new secret is known', () => {
    const sig = `sha256=${computeSignature('new', ts, body)},sha256=${computeSignature('old', ts, body)}`;
    expect(verifySignature(['new'], ts, body, sig, now)).toEqual({ valid: true });
  });
  it('reports NO_SECRETS when nothing is configured', () => {
    expect(verifySignature([], ts, body, 'sha256=x', now)).toEqual({ valid: false, reason: 'NO_SECRETS' });
  });
  it('reports NO_SIGNATURE when the header or timestamp is missing', () => {
    expect(verifySignature(['s1'], ts, body, undefined, now)).toEqual({ valid: false, reason: 'NO_SIGNATURE' });
    expect(verifySignature(['s1'], undefined, body, 'sha256=x', now)).toEqual({ valid: false, reason: 'NO_SIGNATURE' });
  });
  it('reports STALE when the timestamp is more than 300 s away or not numeric', () => {
    const sig = `sha256=${computeSignature('s1', ts, body)}`;
    expect(verifySignature(['s1'], ts, body, sig, now + 301)).toEqual({ valid: false, reason: 'STALE' });
    expect(verifySignature(['s1'], 'abc', body, sig, now)).toEqual({ valid: false, reason: 'STALE' });
  });
  it('reports MISMATCH when the body was altered', () => {
    const sig = `sha256=${computeSignature('s1', ts, body)}`;
    expect(verifySignature(['s1'], ts, body + ' ', sig, now)).toEqual({ valid: false, reason: 'MISMATCH' });
  });
  it('reports MISMATCH for a signature of a different length', () => {
    expect(verifySignature(['s1'], ts, body, 'sha256=abc', now)).toEqual({ valid: false, reason: 'MISMATCH' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/signature.test.ts`
Expected: FAIL — cannot resolve `./signature`.

- [ ] **Step 3: Implement `server/signature.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureReason = 'NO_SECRETS' | 'NO_SIGNATURE' | 'STALE' | 'MISMATCH';

export interface SignatureResult {
  valid: boolean;
  reason?: SignatureReason;
}

/** Deliveries older (or newer) than this are rejected to block replays. */
export const MAX_SKEW_SECONDS = 300;

/** `sha256=<hex>[,sha256=<hex>]` → list of hex digests (two during a secret rotation). */
export function parseSignatureHeader(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => part.trim().replace(/^sha256=/, ''))
    .filter(Boolean);
}

/** HMAC-SHA256(secret, "<timestamp>.<raw body>") in hex, exactly as Carvi signs. */
export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifySignature(
  secrets: string[],
  timestamp: string | undefined,
  rawBody: string,
  signatureHeader: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureResult {
  if (secrets.length === 0) return { valid: false, reason: 'NO_SECRETS' };
  const given = parseSignatureHeader(signatureHeader);
  if (given.length === 0 || !timestamp) return { valid: false, reason: 'NO_SIGNATURE' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) {
    return { valid: false, reason: 'STALE' };
  }
  for (const secret of secrets) {
    const expected = computeSignature(secret, timestamp, rawBody);
    if (given.some((candidate) => safeEqual(candidate, expected))) return { valid: true };
  }
  return { valid: false, reason: 'MISMATCH' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/signature.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Lint, typecheck and commit**

Run: `npm run lint && npm run typecheck`
```bash
git add server/signature.ts server/signature.test.ts
git commit -m "feat(server): verify Carvi webhook signatures

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: SSE channel and HTTP exchange log

**Files:**
- Create: `server/sse.ts`, `server/exchange-log.ts`
- Test: `server/exchange-log.test.ts`

**Interfaces:**
- Produces:
  - `class SseChannel<T> { subscribe(res: express.Response): void; publish(data: T): void; get size(): number }`
  - `interface Exchange { id: string; at: string; method: string; path: string; query: Record<string,string>; requestHeaders: Record<string,string>; requestBody: unknown; status: number; responseHeaders: Record<string,string>; responseBody: unknown; durationMs: number }`
  - `type ExchangeInput = Omit<Exchange, 'id' | 'at'>`
  - `class ExchangeLog { constructor(channel: SseChannel<Exchange>, max?: number); record(input: ExchangeInput): Exchange; list(): Exchange[] /* newest first */ }`
  - `redactHeaders(headers): Record<string,string>` and `redactBody(body): unknown`

- [ ] **Step 1: Write the failing tests**

`server/exchange-log.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ExchangeLog, redactBody, redactHeaders, type Exchange } from './exchange-log';
import { SseChannel } from './sse';

const base = {
  method: 'GET',
  path: '/health',
  query: {},
  requestHeaders: {},
  requestBody: null,
  status: 200,
  responseHeaders: {},
  responseBody: { status: 'ok' },
  durationMs: 12,
};

describe('redactHeaders', () => {
  it('masks Authorization regardless of case and keeps the rest', () => {
    expect(redactHeaders({ Authorization: 'Bearer abc', 'X-Request-Id': 'r1' })).toEqual({
      Authorization: 'Bearer ****',
      'X-Request-Id': 'r1',
    });
    expect(redactHeaders({ authorization: 'Bearer abc' })).toEqual({ authorization: 'Bearer ****' });
  });
});

describe('redactBody', () => {
  it('masks client_secret in a JSON object and leaves other values', () => {
    expect(redactBody({ grant_type: 'client_credentials', client_secret: 's3cret' })).toEqual({
      grant_type: 'client_credentials',
      client_secret: '****',
    });
  });
  it('returns non-objects untouched', () => {
    expect(redactBody(null)).toBeNull();
    expect(redactBody('text')).toBe('text');
  });
});

describe('ExchangeLog', () => {
  it('assigns id and timestamp, redacts, publishes and lists newest first', () => {
    const published: Exchange[] = [];
    const channel = new SseChannel<Exchange>();
    channel.publish = (data) => {
      published.push(data);
    };
    const log = new ExchangeLog(channel, 2);
    const first = log.record({ ...base, requestHeaders: { Authorization: 'Bearer x' } });
    expect(first.id).toMatch(/[0-9a-f-]{36}/);
    expect(first.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.requestHeaders.Authorization).toBe('Bearer ****');
    log.record({ ...base, path: '/vehicles' });
    log.record({ ...base, path: '/bookings' });
    expect(log.list().map((e) => e.path)).toEqual(['/bookings', '/vehicles']);
    expect(published).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/exchange-log.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `server/sse.ts`**

```ts
import type { Response } from 'express';

/** Minimal server-sent-events fan-out: every subscriber gets each published JSON frame. */
export class SseChannel<T> {
  private readonly clients = new Set<Response>();

  subscribe(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(': connected\n\n');
    this.clients.add(res);
    // Keep proxies and browsers from closing an idle stream.
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => {
      clearInterval(ping);
      this.clients.delete(res);
    });
  }

  publish(data: T): void {
    const frame = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) client.write(frame);
  }

  get size(): number {
    return this.clients.size;
  }
}
```

- [ ] **Step 4: Implement `server/exchange-log.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { SseChannel } from './sse';

export interface Exchange {
  id: string;
  at: string;
  method: string;
  path: string;
  query: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

export type ExchangeInput = Omit<Exchange, 'id' | 'at'>;

const SENSITIVE_HEADERS = new Set(['authorization']);
const SENSITIVE_FIELDS = new Set(['client_secret']);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? value.replace(/\s.*$/, ' ****') : value;
  }
  return out;
}

export function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = SENSITIVE_FIELDS.has(key) ? '****' : value;
  }
  return out;
}

/** In-memory ring buffer of HTTP exchanges with Carvi, newest first, mirrored over SSE. */
export class ExchangeLog {
  private readonly items: Exchange[] = [];

  constructor(
    private readonly channel: SseChannel<Exchange>,
    private readonly max = 200,
  ) {}

  record(input: ExchangeInput): Exchange {
    const exchange: Exchange = {
      ...input,
      id: randomUUID(),
      at: new Date().toISOString(),
      requestHeaders: redactHeaders(input.requestHeaders),
      requestBody: redactBody(input.requestBody),
    };
    this.items.unshift(exchange);
    if (this.items.length > this.max) this.items.length = this.max;
    this.channel.publish(exchange);
    return exchange;
  }

  list(): Exchange[] {
    return [...this.items];
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run server/exchange-log.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Lint, typecheck and commit**

Run: `npm run lint && npm run typecheck`
```bash
git add server/sse.ts server/exchange-log.ts server/exchange-log.test.ts
git commit -m "feat(server): SSE channel and redacted exchange log

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: Config and token manager

**Files:**
- Create: `server/errors.ts`, `server/config.ts`, `server/token-manager.ts`
- Test: `server/config.test.ts`, `server/token-manager.test.ts`

**Interfaces:**
- Consumes: `ExchangeInput` from Task 3.
- Produces:
  - `class UpstreamError extends Error { constructor(message: string, readonly requestId: string) }`
  - `class TokenError extends Error { constructor(readonly status: number, readonly body: unknown) }`
  - `interface ServerConfig { apiBaseUrl: string; clientId: string; clientSecret: string; webhookSecrets: string[]; port: number; publicWebhookUrl: string }`
  - `loadConfig(env?: NodeJS.ProcessEnv): ServerConfig` (throws `Error('Missing environment variables: A, B')`)
  - `class TokenManager { constructor(deps: TokenManagerDeps); getToken(): Promise<string>; invalidate(): void }`
  - `interface TokenManagerDeps { apiBaseUrl: string; clientId: string; clientSecret: string; fetchFn?: typeof fetch; now?: () => number; onExchange?: (e: ExchangeInput) => void }`

- [ ] **Step 1: Write the failing config tests**

`server/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('lists every missing required variable', () => {
    expect(() => loadConfig({})).toThrow('Missing environment variables: CARVI_CLIENT_ID, CARVI_CLIENT_SECRET');
  });
  it('applies defaults and parses the webhook secrets', () => {
    const cfg = loadConfig({ CARVI_CLIENT_ID: 'id', CARVI_CLIENT_SECRET: 'sec', CARVI_WEBHOOK_SECRETS: ' a , b ,' });
    expect(cfg).toEqual({
      apiBaseUrl: 'http://localhost:3999/integrations/v1',
      clientId: 'id',
      clientSecret: 'sec',
      webhookSecrets: ['a', 'b'],
      port: 4020,
      publicWebhookUrl: 'http://localhost:4020/webhooks/carvi',
    });
  });
  it('strips a trailing slash from the base URL and derives the webhook URL from PORT', () => {
    const cfg = loadConfig({ CARVI_CLIENT_ID: 'id', CARVI_CLIENT_SECRET: 'sec', CARVI_API_BASE_URL: 'https://x/integrations/v1/', PORT: '4100' });
    expect(cfg.apiBaseUrl).toBe('https://x/integrations/v1');
    expect(cfg.publicWebhookUrl).toBe('http://localhost:4100/webhooks/carvi');
  });
});
```

- [ ] **Step 2: Write the failing token manager tests**

`server/token-manager.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { ExchangeInput } from './exchange-log';
import { TokenError } from './errors';
import { TokenManager } from './token-manager';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(responses: Array<() => Response | Promise<Response>>, start = 1_000_000) {
  let clock = start;
  const fetchFn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  });
  const exchanges: ExchangeInput[] = [];
  const manager = new TokenManager({
    apiBaseUrl: 'http://carvi.test/integrations/v1',
    clientId: 'cid',
    clientSecret: 'csecret',
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => clock,
    onExchange: (e) => exchanges.push(e),
  });
  return { manager, fetchFn, exchanges, advance: (ms: number) => (clock += ms) };
}

const token = (value: string, expiresIn = 900) => () =>
  jsonResponse(201, { access_token: value, token_type: 'Bearer', expires_in: expiresIn });

describe('TokenManager', () => {
  it('requests a token once and reuses it', async () => {
    const { manager, fetchFn } = setup([token('t1')]);
    expect(await manager.getToken()).toBe('t1');
    expect(await manager.getToken()).toBe('t1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://carvi.test/integrations/v1/auth/token');
    expect(JSON.parse(String(init.body))).toEqual({ grant_type: 'client_credentials', client_id: 'cid', client_secret: 'csecret' });
  });
  it('renews when less than 60 s remain', async () => {
    const { manager, fetchFn, advance } = setup([token('t1'), token('t2')]);
    await manager.getToken();
    advance(900_000 - 61_000);
    expect(await manager.getToken()).toBe('t1');
    advance(2_000);
    expect(await manager.getToken()).toBe('t2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('shares one in-flight request between concurrent callers', async () => {
    const { manager, fetchFn } = setup([token('t1')]);
    const [a, b] = await Promise.all([manager.getToken(), manager.getToken()]);
    expect(a).toBe('t1');
    expect(b).toBe('t1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('invalidate() forces a new request', async () => {
    const { manager, fetchFn } = setup([token('t1'), token('t2')]);
    await manager.getToken();
    manager.invalidate();
    expect(await manager.getToken()).toBe('t2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('falls back to 900 s when expires_in is missing', async () => {
    const { manager, fetchFn, advance } = setup([
      () => jsonResponse(201, { access_token: 't1', token_type: 'Bearer' }),
      token('t2'),
    ]);
    await manager.getToken();
    advance(800_000);
    expect(await manager.getToken()).toBe('t1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('throws TokenError with the upstream body on 401 and records the exchange with the secret masked', async () => {
    const body = { error: { code: 'INVALID_TOKEN', message: 'bad credentials', details: null, requestId: 'r' } };
    const { manager, exchanges } = setup([() => jsonResponse(401, body)]);
    const err = await manager.getToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TokenError);
    expect(err).toMatchObject({ status: 401, body });
    expect(exchanges[0]).toMatchObject({ method: 'POST', path: '/auth/token', status: 401 });
    expect((exchanges[0].requestBody as { client_secret: string }).client_secret).toBe('****');
  });
  it('wraps a network failure in UpstreamError', async () => {
    const { manager } = setup([() => Promise.reject(new Error('ECONNREFUSED'))]);
    await expect(manager.getToken()).rejects.toMatchObject({ name: 'UpstreamError', message: 'ECONNREFUSED' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run server/config.test.ts server/token-manager.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `server/errors.ts`**

```ts
/** Carvi could not be reached at all (DNS, refused connection, timeout). */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly requestId: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** `POST /auth/token` answered with an error status; `body` is Carvi's envelope. */
export class TokenError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Token request failed with status ${status}`);
    this.name = 'TokenError';
  }
}
```

- [ ] **Step 5: Implement `server/config.ts`**

```ts
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
```

- [ ] **Step 6: Implement `server/token-manager.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { TokenError, UpstreamError } from './errors';
import type { ExchangeInput } from './exchange-log';

export interface TokenManagerDeps {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  onExchange?: (exchange: ExchangeInput) => void;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

const DEFAULT_TTL_SECONDS = 900;
const RENEW_MARGIN_MS = 60_000;

/** Caches the client-credentials token and renews it shortly before it expires. */
export class TokenManager {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly deps: TokenManagerDeps) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  async getToken(): Promise<string> {
    if (this.token && this.expiresAt - this.now() > RENEW_MARGIN_MS) return this.token;
    if (!this.inflight) {
      this.inflight = this.request().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async request(): Promise<string> {
    const requestId = randomUUID();
    const body = { grant_type: 'client_credentials', client_id: this.deps.clientId, client_secret: this.deps.clientSecret };
    // Never let the secret reach the log, even before ExchangeLog redacts.
    const loggedBody = { ...body, client_secret: '****' };
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Request-Id': requestId };
    const started = this.now();
    let res: Response;
    try {
      res = await this.fetchFn(`${this.deps.apiBaseUrl}/auth/token`, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.onExchange?.({ method: 'POST', path: '/auth/token', query: {}, requestHeaders: headers, requestBody: loggedBody, status: 0, responseHeaders: {}, responseBody: { error: message }, durationMs: this.now() - started });
      throw new UpstreamError(message, requestId);
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    this.deps.onExchange?.({
      method: 'POST',
      path: '/auth/token',
      query: {},
      requestHeaders: headers,
      requestBody: loggedBody,
      status: res.status,
      responseHeaders: { 'x-request-id': res.headers.get('x-request-id') ?? requestId },
      responseBody: parsed,
      durationMs: this.now() - started,
    });
    if (!res.ok) throw new TokenError(res.status, parsed);
    const data = parsed as TokenResponse;
    this.token = data.access_token;
    this.expiresAt = this.now() + (data.expires_in ?? DEFAULT_TTL_SECONDS) * 1000;
    return this.token;
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run server/config.test.ts server/token-manager.test.ts`
Expected: 10 passed.

- [ ] **Step 8: Lint, typecheck and commit**

Run: `npm run lint && npm run typecheck`
```bash
git add server/errors.ts server/config.ts server/config.test.ts server/token-manager.ts server/token-manager.test.ts
git commit -m "feat(server): env config and cached client-credentials token

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Carvi client, proxy router and server bootstrap

**Files:**
- Create: `server/carvi-client.ts`, `server/proxy.ts`
- Modify: `server/index.ts` (replace placeholder)
- Test: `server/carvi-client.test.ts`, `server/proxy.test.ts`

**Interfaces:**
- Consumes: `TokenManager`, `TokenError`, `UpstreamError`, `ExchangeLog`, `SseChannel`, `loadConfig`.
- Produces:
  - `interface CarviRequest { method: string; path: string; query?: Record<string,string>; body?: unknown; idempotencyKey?: string }`
  - `interface CarviResponse { status: number; headers: Record<string,string>; body: unknown }`
  - `class CarviClient { constructor(apiBaseUrl: string, tokens: TokenManager, log: ExchangeLog, fetchFn?: typeof fetch); call(req: CarviRequest): Promise<CarviResponse> }`
  - `errorCode(body: unknown): string | undefined`
  - `toQuery(query: express.Request['query']): Record<string,string>`
  - `envelope(code: string, message: string, requestId: string)`
  - `createProxyRouter(client: CarviClient): express.Router` mounted at `/api` → handles `/api/carvi/*`
  - HTTP: `GET /api/config`, `GET /api/log`, `GET /api/log/stream`

- [ ] **Step 1: Write the failing client tests**

`server/carvi-client.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { CarviClient, errorCode } from './carvi-client';
import { ExchangeLog, type Exchange } from './exchange-log';
import { SseChannel } from './sse';
import { TokenManager } from './token-manager';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    void url;
    void init;
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  });
  const channel = new SseChannel<Exchange>();
  const log = new ExchangeLog(channel);
  const tokens = new TokenManager({ apiBaseUrl: 'http://carvi.test/v1', clientId: 'c', clientSecret: 's', fetchFn: fetchFn as unknown as typeof fetch });
  const client = new CarviClient('http://carvi.test/v1', tokens, log, fetchFn as unknown as typeof fetch);
  return { client, fetchFn, log };
}

const tokenOk = () => jsonResponse(201, { access_token: 'tok', token_type: 'Bearer', expires_in: 900 });

describe('CarviClient.call', () => {
  it('adds bearer, request id, idempotency key and query, and forwards selected headers', async () => {
    const { client, fetchFn, log } = setup([
      tokenOk,
      () => jsonResponse(201, { id: 'b1' }, { 'x-request-id': 'req-1', 'idempotent-replayed': 'true', 'retry-after': '3' }),
    ]);
    const res = await client.call({ method: 'POST', path: '/bookings', query: { page: '2' }, body: { quoteId: 'q' }, idempotencyKey: 'key-1' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'b1' });
    expect(res.headers).toMatchObject({ 'x-request-id': 'req-1', 'idempotent-replayed': 'true', 'retry-after': '3' });
    const [url, init] = fetchFn.mock.calls[1] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://carvi.test/v1/bookings?page=2');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(headers['X-Request-Id']).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(String(init.body))).toEqual({ quoteId: 'q' });
    expect(log.list()[0]).toMatchObject({ method: 'POST', path: '/bookings', status: 201, requestHeaders: { Authorization: 'Bearer ****' } });
  });
  it('retries once with a fresh token after 401 INVALID_TOKEN', async () => {
    const invalid = { error: { code: 'INVALID_TOKEN', message: 'expired', details: null, requestId: 'r' } };
    const { client, fetchFn } = setup([tokenOk, () => jsonResponse(401, invalid), tokenOk, () => jsonResponse(200, { status: 'ok' })]);
    const res = await client.call({ method: 'GET', path: '/health' });
    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
  it('does not retry other 401s or 403s', async () => {
    const forbidden = { error: { code: 'FORBIDDEN', message: 'scope', details: null, requestId: 'r' } };
    const { client, fetchFn } = setup([tokenOk, () => jsonResponse(403, forbidden)]);
    const res = await client.call({ method: 'GET', path: '/vehicles' });
    expect(res.status).toBe(403);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('returns null body for an empty response', async () => {
    const { client } = setup([tokenOk, () => new Response(null, { status: 204 })]);
    const res = await client.call({ method: 'GET', path: '/x' });
    expect(res.body).toBeNull();
  });
  it('throws UpstreamError on a network failure and records the attempt', async () => {
    const { client, log } = setup([tokenOk, () => Promise.reject(new Error('ECONNREFUSED'))]);
    await expect(client.call({ method: 'GET', path: '/health' })).rejects.toMatchObject({ name: 'UpstreamError' });
    expect(log.list()[0]).toMatchObject({ path: '/health', status: 0 });
  });
});

describe('errorCode', () => {
  it('reads error.code from the envelope', () => {
    expect(errorCode({ error: { code: 'X' } })).toBe('X');
    expect(errorCode({ data: [] })).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write the failing proxy helper tests**

`server/proxy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { envelope, toQuery } from './proxy';

describe('toQuery', () => {
  it('keeps strings, joins arrays with commas and drops objects', () => {
    const query = { page: '1', vehicleIds: ['a', 'b'], nested: { x: '1' } } as unknown as Request['query'];
    expect(toQuery(query)).toEqual({ page: '1', vehicleIds: 'a,b' });
  });
});

describe('envelope', () => {
  it('builds the Carvi error envelope', () => {
    expect(envelope('UPSTREAM_UNREACHABLE', 'down', 'r1')).toEqual({
      error: { code: 'UPSTREAM_UNREACHABLE', message: 'down', details: null, requestId: 'r1' },
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run server/carvi-client.test.ts server/proxy.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `server/carvi-client.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { UpstreamError } from './errors';
import type { ExchangeLog } from './exchange-log';
import type { TokenManager } from './token-manager';

export interface CarviRequest {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  idempotencyKey?: string;
}

export interface CarviResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Response headers the browser needs to see (the technical panel shows them). */
export const FORWARDED_RESPONSE_HEADERS = ['x-request-id', 'idempotent-replayed', 'retry-after', 'cache-control'] as const;

export function errorCode(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { code?: unknown } }).error;
    if (error && typeof error.code === 'string') return error.code;
  }
  return undefined;
}

export function pickHeaders(headers: Headers, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value !== null) out[name] = value;
  }
  return out;
}

export async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Authenticated HTTP client for /integrations/v1; every exchange is recorded. */
export class CarviClient {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly tokens: TokenManager,
    private readonly log: ExchangeLog,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async call(req: CarviRequest): Promise<CarviResponse> {
    const first = await this.send(req);
    if (first.status === 401 && errorCode(first.body) === 'INVALID_TOKEN') {
      this.tokens.invalidate();
      return this.send(req);
    }
    return first;
  }

  private async send(req: CarviRequest): Promise<CarviResponse> {
    const requestId = randomUUID();
    const token = await this.tokens.getToken();
    const url = new URL(`${this.apiBaseUrl}${req.path}`);
    for (const [key, value] of Object.entries(req.query ?? {})) url.searchParams.set(key, value);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-Request-Id': requestId };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;
    const query = req.query ?? {};
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchFn(url, { method: req.method, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.record({ method: req.method, path: req.path, query, requestHeaders: headers, requestBody: req.body ?? null, status: 0, responseHeaders: {}, responseBody: { error: message }, durationMs: Date.now() - started });
      throw new UpstreamError(message, requestId);
    }
    const body = await readJsonBody(res);
    const responseHeaders = pickHeaders(res.headers, FORWARDED_RESPONSE_HEADERS);
    this.log.record({ method: req.method, path: req.path, query, requestHeaders: headers, requestBody: req.body ?? null, status: res.status, responseHeaders, responseBody: body, durationMs: Date.now() - started });
    return { status: res.status, headers: responseHeaders, body };
  }
}
```

- [ ] **Step 5: Implement `server/proxy.ts`**

```ts
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

/** `ALL /carvi/*` → Carvi `/integrations/v1/*`, same status and body, selected headers forwarded. */
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
        res.status(err.status).json(err.body ?? envelope('TOKEN_ERROR', err.message, randomUUID()));
      } else if (err instanceof UpstreamError) {
        res.status(502).json(envelope('UPSTREAM_UNREACHABLE', `No se pudo conectar con la API de Carvi: ${err.message}`, err.requestId));
      } else {
        res.status(500).json(envelope('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unexpected error', randomUUID()));
      }
    }
  });
  return router;
}
```

- [ ] **Step 6: Replace `server/index.ts`**

```ts
import express from 'express';
import { CarviClient } from './carvi-client';
import { loadConfig } from './config';
import { ExchangeLog, type Exchange } from './exchange-log';
import { createProxyRouter } from './proxy';
import { SseChannel } from './sse';
import { TokenManager } from './token-manager';

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

const app = express();
app.disable('x-powered-by');

app.get('/api/config', (_req, res) => {
  res.json({
    apiBaseUrl: config.apiBaseUrl,
    clientId: config.clientId,
    webhookUrl: config.publicWebhookUrl,
    webhookSecretsConfigured: config.webhookSecrets.length,
  });
});
app.get('/api/log', (_req, res) => res.json(log.list()));
app.get('/api/log/stream', (_req, res) => exchangeChannel.subscribe(res));
app.use('/api', express.json(), createProxyRouter(client));

app.listen(config.port, () => {
  console.log(`[demo-socio] server on http://localhost:${config.port} → ${config.apiBaseUrl}`);
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: all suites pass (signature, exchange-log, config, token-manager, carvi-client, proxy).

- [ ] **Step 8: Smoke-test against the local backend**

Create `.env` from `.env.example` with a real sandbox credential (created in the portal; the backend must be running on `:3999`). Then:
```bash
npm run dev:server &
curl -s http://localhost:4020/api/config
curl -s http://localhost:4020/api/carvi/health
curl -s -i "http://localhost:4020/api/carvi/vehicles?limit=2" | head -20
curl -s http://localhost:4020/api/log | head -c 600
```
Expected: config JSON without secrets; `/health` returns `{ status: "ok", environment: "sandbox", ... }`; vehicles response carries `cache-control` and `x-request-id`; the log lists the token request (`client_secret: "****"`) and the two calls. Stop the server afterwards.

- [ ] **Step 9: Lint, typecheck and commit**

Run: `npm run lint && npm run typecheck`
```bash
git add server/carvi-client.ts server/carvi-client.test.ts server/proxy.ts server/proxy.test.ts server/index.ts
git commit -m "feat(server): authenticated proxy to Carvi with exchange log endpoints

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Webhook receiver

**Files:**
- Create: `server/webhooks.ts`, `scripts/send-test-webhook.mjs`
- Modify: `server/index.ts`
- Test: `server/webhooks.test.ts`

**Interfaces:**
- Consumes: `verifySignature`, `SignatureReason`, `SseChannel`.
- Produces:
  - `type SignatureStatus = 'VALID' | 'INVALID' | 'UNVERIFIED'`
  - `interface ReceivedEvent { id: string; receivedAt: string; type: string; eventId: string; keyId: string; timestamp: string; signatureStatus: SignatureStatus; reason?: SignatureReason; duplicate: boolean; payload: unknown; headers: Record<string,string> }`
  - `class EventStore { constructor(channel: SseChannel<ReceivedEvent>, max?: number); record(input: Omit<ReceivedEvent,'id'|'receivedAt'|'duplicate'>): ReceivedEvent; list(): ReceivedEvent[] /* newest first */ }`
  - `classifySignature(result: SignatureResult): SignatureStatus`, `parsePayload(raw: string): unknown`
  - `createWebhookRouter(secrets: string[], store: EventStore): express.Router` mounted at `/webhooks` → `POST /webhooks/carvi`
  - HTTP: `GET /api/events`, `GET /api/events/stream`

- [ ] **Step 1: Write the failing tests**

`server/webhooks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SseChannel } from './sse';
import { classifySignature, EventStore, parsePayload, type ReceivedEvent } from './webhooks';

describe('classifySignature', () => {
  it('maps verification results to statuses', () => {
    expect(classifySignature({ valid: true })).toBe('VALID');
    expect(classifySignature({ valid: false, reason: 'NO_SECRETS' })).toBe('UNVERIFIED');
    expect(classifySignature({ valid: false, reason: 'MISMATCH' })).toBe('INVALID');
    expect(classifySignature({ valid: false, reason: 'STALE' })).toBe('INVALID');
  });
});

describe('parsePayload', () => {
  it('parses JSON and falls back to the raw string', () => {
    expect(parsePayload('{"a":1}')).toEqual({ a: 1 });
    expect(parsePayload('not json')).toBe('not json');
    expect(parsePayload('')).toBe('');
  });
});

describe('EventStore', () => {
  const input = {
    type: 'booking.confirmed',
    eventId: 'evt_1',
    keyId: 'cid',
    timestamp: '1',
    signatureStatus: 'VALID' as const,
    payload: { eventId: 'evt_1' },
    headers: {},
  };
  it('flags a repeated eventId as duplicate and still publishes it', () => {
    const published: ReceivedEvent[] = [];
    const channel = new SseChannel<ReceivedEvent>();
    channel.publish = (e) => {
      published.push(e);
    };
    const store = new EventStore(channel);
    expect(store.record(input).duplicate).toBe(false);
    expect(store.record(input).duplicate).toBe(true);
    expect(store.record({ ...input, eventId: '' }).duplicate).toBe(false);
    expect(published).toHaveLength(3);
    expect(store.list()[0].eventId).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/webhooks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/webhooks.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { raw, Router } from 'express';
import { verifySignature, type SignatureReason, type SignatureResult } from './signature';
import type { SseChannel } from './sse';

export type SignatureStatus = 'VALID' | 'INVALID' | 'UNVERIFIED';

export interface ReceivedEvent {
  id: string;
  receivedAt: string;
  type: string;
  eventId: string;
  keyId: string;
  timestamp: string;
  signatureStatus: SignatureStatus;
  reason?: SignatureReason;
  duplicate: boolean;
  payload: unknown;
  headers: Record<string, string>;
}

export type ReceivedEventInput = Omit<ReceivedEvent, 'id' | 'receivedAt' | 'duplicate'>;

export function classifySignature(result: SignatureResult): SignatureStatus {
  if (result.valid) return 'VALID';
  return result.reason === 'NO_SECRETS' ? 'UNVERIFIED' : 'INVALID';
}

export function parsePayload(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** In-memory list of received deliveries, newest first, deduplicated by eventId (flag only). */
export class EventStore {
  private readonly items: ReceivedEvent[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly channel: SseChannel<ReceivedEvent>,
    private readonly max = 200,
  ) {}

  record(input: ReceivedEventInput): ReceivedEvent {
    const duplicate = input.eventId !== '' && this.seen.has(input.eventId);
    if (input.eventId) this.seen.add(input.eventId);
    const event: ReceivedEvent = { ...input, id: randomUUID(), receivedAt: new Date().toISOString(), duplicate };
    this.items.unshift(event);
    if (this.items.length > this.max) this.items.length = this.max;
    this.channel.publish(event);
    return event;
  }

  list(): ReceivedEvent[] {
    return [...this.items];
  }
}

const ECHOED_HEADERS = ['x-carvi-event', 'x-carvi-event-id', 'x-carvi-timestamp', 'x-carvi-signature', 'x-carvi-key-id', 'x-request-id', 'user-agent'];

export function createWebhookRouter(secrets: string[], store: EventStore): Router {
  const router = Router();
  // Raw body: the signature covers the bytes exactly as sent, never a re-serialisation.
  router.post('/carvi', raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const header = (name: string) => req.header(name) ?? '';
    const result = verifySignature(secrets, header('X-Carvi-Timestamp') || undefined, rawBody, header('X-Carvi-Signature') || undefined);
    const signatureStatus = classifySignature(result);
    const payload = parsePayload(rawBody);
    const fromPayload = (key: string) => (isRecord(payload) && typeof payload[key] === 'string' ? (payload[key] as string) : '');
    const headers: Record<string, string> = {};
    for (const name of ECHOED_HEADERS) headers[name] = header(name);
    store.record({
      type: header('X-Carvi-Event') || fromPayload('type') || 'unknown',
      eventId: header('X-Carvi-Event-Id') || fromPayload('eventId'),
      keyId: header('X-Carvi-Key-Id'),
      timestamp: header('X-Carvi-Timestamp'),
      signatureStatus,
      reason: result.reason,
      payload,
      headers,
    });
    if (signatureStatus === 'INVALID') {
      res.status(401).json({ error: 'INVALID_SIGNATURE', reason: result.reason });
      return;
    }
    res.status(200).json({ received: true });
  });
  return router;
}
```

- [ ] **Step 4: Wire it into `server/index.ts`**

Add the imports and, after the `/api/log/stream` route:
```ts
import { createWebhookRouter, EventStore, type ReceivedEvent } from './webhooks';
// ...
const eventChannel = new SseChannel<ReceivedEvent>();
const events = new EventStore(eventChannel);
// ...
app.get('/api/events', (_req, res) => res.json(events.list()));
app.get('/api/events/stream', (_req, res) => eventChannel.subscribe(res));
app.use('/webhooks', createWebhookRouter(config.webhookSecrets, events));
```
Keep `app.use('/api', express.json(), createProxyRouter(client))` after the `/api/*` GET routes, and mount `/webhooks` **without** `express.json()` (it needs the raw body).

- [ ] **Step 5: Write `scripts/send-test-webhook.mjs`** (signed test delivery, useful without a backend)

```js
#!/usr/bin/env node
// Sends one signed booking.confirmed delivery to the local demo server.
//   node scripts/send-test-webhook.mjs [secret] [url]
import { createHmac, randomUUID } from 'node:crypto';

const secret = process.argv[2] ?? process.env.CARVI_WEBHOOK_SECRETS?.split(',')[0] ?? 'demo-secret';
const url = process.argv[3] ?? 'http://localhost:4020/webhooks/carvi';
const eventId = `evt_${randomUUID().slice(0, 8)}`;
const body = JSON.stringify({
  eventId,
  type: 'booking.confirmed',
  occurredAt: new Date().toISOString(),
  data: { bookingId: 'demo', externalReference: 'TEST-1', confirmationCode: 'CV-TEST01', status: 'CONFIRMED', booking: { id: 'demo', status: 'CONFIRMED' } },
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Carvi-Event': 'booking.confirmed',
    'X-Carvi-Event-Id': eventId,
    'X-Carvi-Timestamp': timestamp,
    'X-Carvi-Signature': `sha256=${signature}`,
    'X-Carvi-Key-Id': 'demo-client',
    'X-Request-Id': randomUUID(),
    'User-Agent': 'Carvi-Webhooks/1',
  },
  body,
});
console.log(res.status, await res.text());
```

- [ ] **Step 6: Run the tests and a manual delivery**

Run: `npx vitest run` → all pass.
Run with `CARVI_WEBHOOK_SECRETS=demo-secret` in `.env`: `npm run dev:server &`, then `node scripts/send-test-webhook.mjs demo-secret` → `200 {"received":true}`; `node scripts/send-test-webhook.mjs wrong` → `401 {"error":"INVALID_SIGNATURE","reason":"MISMATCH"}`; `curl -s http://localhost:4020/api/events | head -c 400` shows both with `signatureStatus` `VALID` and `INVALID`. Stop the server.

- [ ] **Step 7: Lint, typecheck and commit**

Run: `npm run lint && npm run typecheck`
```bash
git add server/webhooks.ts server/webhooks.test.ts server/index.ts scripts/send-test-webhook.mjs
git commit -m "feat(server): signed webhook receiver with live event feed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: Front foundation — API layer, libs, UI kit, layout, Estado page

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`, `src/api/requests.ts`, `src/api/hooks.ts`, `src/lib/dates.ts`, `src/lib/format.ts`, `src/lib/idempotency.ts`, `src/lib/sse.ts`, `src/lib/countdown.ts`, `src/lib/notify.ts`, `src/components/ui.tsx`, `src/components/StatusBadge.tsx`, `src/components/Pagination.tsx`, `src/components/Layout.tsx`, `src/pages/StatusPage.tsx`, `src/router.tsx`
- Modify: `src/App.tsx`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - Types in `src/api/types.ts` (see Step 3).
  - `carvi` (axios, baseURL `/api/carvi`), `local` (axios, baseURL `/api`), `class CarviApiError { status; code; message; details; requestId }`.
  - Request functions in `src/api/requests.ts`: `getHealth()`, `listVehicles(page, limit)`, `getVehicle(id)`, `getAvailability(params)`, `createQuote(input)`, `createBooking(input, idempotencyKey)`, `listBookings(filter)`, `getBooking(id)`, `confirmBooking(id, payment, idempotencyKey)`, `cancelBooking(id, reason, idempotencyKey)`, `getServerConfig()`.
  - Hooks in `src/api/hooks.ts`: `useServerConfig`, `useHealth`, `useVehicles(page, limit?)`, `useVehicle(id?)`, `useAvailability(params | null)`, `useCreateQuote`, `useCreateBooking`, `useBookings(filter)`, `useBooking(id?)`, `useConfirmBooking`, `useCancelBooking`.
  - `calendarDaysInclusive(from, to)`, `MIN_RENT_DAYS`, `defaultPeriod()`, `fmtDate`, `fmtDateTime`, `money(n)`, `newIdempotencyKey()`, `useEventSource<T>(url, onMessage)`, `useCountdown(targetIso)`, `notifyError(err)`.
  - UI kit: `cn`, `Button`, `Card`, `Badge`, `Input`, `Select`, `Field`, `JsonBlock`, `Modal`, `Spinner`, `EmptyState`; `StatusBadge({ status })`; `Pagination({ meta, onPage })`.
  - `Layout` renders the sidebar + `<Outlet />` + a slot `techPanel?: ReactNode` (Task 8 fills it).

- [ ] **Step 1: Write the failing date test**

`src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { calendarDaysInclusive, meetsMinRentDays } from './dates';

describe('calendarDaysInclusive', () => {
  it('counts both ends as full days, ignoring hours', () => {
    expect(calendarDaysInclusive('2026-10-10', '2026-10-14')).toBe(5);
    expect(calendarDaysInclusive('2026-10-10', '2026-10-13')).toBe(4);
    expect(calendarDaysInclusive('2026-10-10', '2026-10-10')).toBe(1);
  });
  it('applies the 5-day minimum', () => {
    expect(meetsMinRentDays('2026-10-10', '2026-10-14')).toBe(true);
    expect(meetsMinRentDays('2026-10-10', '2026-10-13')).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/dates.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/dates.ts`, `format.ts`, `idempotency.ts`, `sse.ts`, `countdown.ts`, `notify.ts`**

`src/lib/dates.ts`:
```ts
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';

export const MIN_RENT_DAYS = 5;

export interface PeriodInput {
  from: string;
  to: string;
  startTime: string;
  endTime: string;
}

/** Same rule as Carvi: `to − from + 1`, hours ignored. */
export function calendarDaysInclusive(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
}

export function meetsMinRentDays(from: string, to: string): boolean {
  return calendarDaysInclusive(from, to) >= MIN_RENT_DAYS;
}

export const isoDate = (date: Date): string => format(date, 'yyyy-MM-dd');

/** A week from today, exactly five calendar days, 10:00 → 10:00. */
export function defaultPeriod(): PeriodInput {
  const from = addDays(new Date(), 7);
  return { from: isoDate(from), to: isoDate(addDays(from, MIN_RENT_DAYS - 1)), startTime: '10:00', endTime: '10:00' };
}

export const fmtDate = (iso: string): string => format(parseISO(iso), 'dd/MM/yyyy');
export const fmtDateTime = (iso: string): string => format(new Date(iso), 'dd/MM/yyyy HH:mm:ss');
export const fmtTime = (iso: string): string => format(new Date(iso), 'HH:mm:ss');
```

`src/lib/format.ts`:
```ts
export const money = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `$${value.toFixed(2)}`;

export const round2 = (value: number): number => Math.round(value * 100) / 100;
```

`src/lib/idempotency.ts`:
```ts
/** One key per logical operation; reuse it to repeat the same request. */
export const newIdempotencyKey = (): string => crypto.randomUUID();

export const newExternalPaymentId = (): string => `demo_pay_${crypto.randomUUID().slice(0, 8)}`;
```

`src/lib/sse.ts`:
```ts
import { useEffect, useRef, useState } from 'react';

/** Subscribes to a server-sent-events URL; the browser reconnects on its own. */
export function useEventSource<T>(url: string, onMessage: (data: T) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });
  useEffect(() => {
    const source = new EventSource(url);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        handler.current(JSON.parse(event.data) as T);
      } catch {
        // ignore malformed frames
      }
    };
    return () => source.close();
  }, [url]);
  return { connected };
}
```

`src/lib/countdown.ts`:
```ts
import { useEffect, useState } from 'react';

export interface Countdown {
  secondsLeft: number;
  expired: boolean;
  /** Seconds elapsed since the target passed (0 while not expired). */
  secondsSinceExpiry: number;
}

export function useCountdown(targetIso: string | null | undefined): Countdown {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return { secondsLeft: 0, expired: false, secondsSinceExpiry: 0 };
  const diff = Math.floor((new Date(targetIso).getTime() - now) / 1000);
  return { secondsLeft: Math.max(0, diff), expired: diff <= 0, secondsSinceExpiry: diff <= 0 ? -diff : 0 };
}

export const mmss = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
```

`src/lib/notify.ts`:
```ts
import { toast } from 'sonner';
import { CarviApiError } from '../api/client';

export function notifyError(err: unknown): void {
  if (err instanceof CarviApiError) {
    toast.error(`${err.code} · ${err.message}`, {
      description: err.details ? JSON.stringify(err.details) : undefined,
    });
    return;
  }
  toast.error(err instanceof Error ? err.message : 'Error inesperado');
}
```

Run: `npx vitest run src/lib/dates.test.ts` → 2 passed.

- [ ] **Step 3: Write `src/api/types.ts`**

```ts
export type BookingStatus = 'HOLD' | 'EXPIRED' | 'CONFIRMED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export const BOOKING_STATUSES: BookingStatus[] = ['HOLD', 'EXPIRED', 'CONFIRMED', 'STARTED', 'COMPLETED', 'CANCELLED'];

export interface PageMeta { page: number; limit: number; total: number; totalPages: number }
export interface Paged<T> { data: T[]; meta: PageMeta }

export interface Host { id: string; displayName: string }

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  type: string;
  transmission: string;
  seats: number;
  airConditioning: boolean;
  consumption: number;
  rateDay: number;
  currency: string;
  images: { main: string; gallery: string[] };
  rating: { average: number; count: number };
  status: 'PUBLISHED';
  host: Host;
}

export interface AvailabilityParams { vehicleIds: string[]; from: string; to: string; startTime: string; endTime: string }
export interface AvailabilityRow { vehicleId: string; available: boolean; reason?: 'BOOKED' | 'BLOCKED' | 'NOT_FOUND'; rateDay?: number; currency?: string }
export interface AvailabilityResponse {
  data: AvailabilityRow[];
  meta: { from: string; to: string; startTime: string; endTime: string; timezone: string; gapHours: number };
}

export interface Period { from: string; to: string; startTime: string; endTime: string; timezone?: string }
export interface Pricing {
  rateDay: number; totalDays: number; totalHours: number; subtotal: number; advance: number; serviceFee: number; amountDue: number; total: number; currency: string;
}

export interface QuoteInput { vehicleId: string; from: string; to: string; startTime: string; endTime: string }
export interface Quote { quoteId: string; expiresAt: string; vehicle: { id: string; rateDay: number; currency: string }; period: Period; pricing: Pricing }

export interface Customer { fullName: string; email: string; phone: string; country: string }
export interface Place { location: string }
export interface BookingInput { quoteId: string; externalReference?: string; customer: Customer; pickup: Place; dropoff: Place }

export interface BookingVehicle {
  id: string; brand: string; model: string; year: number; type: string; transmission: string; seats: number; airConditioning: boolean; image?: string; host?: Host;
}
export interface BookingPayment { provider: string; externalPaymentId: string; amount: number; currency: string; status: string }
export interface BookingCancellation { reason: string | null; at: string | null; refundableAmount: number }

export interface Booking {
  id: string;
  confirmationCode: string;
  status: BookingStatus;
  channel: string;
  externalReference: string | null;
  vehicle: BookingVehicle;
  customer: Customer;
  period: Period;
  pickup: Place;
  dropoff: Place;
  pricing: Pricing;
  hold: { expiresAt: string } | null;
  payment: BookingPayment | null;
  cancellation: BookingCancellation | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentInput { externalPaymentId: string; amount: number; currency: 'USD' }
export interface CancelResult { booking: Booking; cancellation: { reason: string; refundableAmount: number; currency: string; policy: string } }

export interface BookingsFilter { page: number; limit: number; status?: BookingStatus; from?: string; to?: string }

export interface HealthResponse {
  status: string; time: string; environment: 'sandbox' | 'production'; database: 'up' | 'down'; credential: { clientId: string; scopes: string[] };
}
export interface ServerConfig { apiBaseUrl: string; clientId: string; webhookUrl: string; webhookSecretsConfigured: number }
export interface ErrorEnvelope { error: { code: string; message: string; details: unknown; requestId: string } }

export const PLACES = [
  { code: 'AIRPORT', label: 'Aeropuerto Internacional de San Salvador' },
  { code: 'SAN_SALVADOR', label: 'Ciudad de San Salvador' },
] as const;
export const placeLabel = (code: string): string => PLACES.find((p) => p.code === code)?.label ?? code;
```

- [ ] **Step 4: Write `src/api/client.ts` and `src/api/requests.ts`**

`src/api/client.ts`:
```ts
import axios, { AxiosError } from 'axios';
import type { ErrorEnvelope } from './types';

export class CarviApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
    readonly requestId = '',
  ) {
    super(message);
    this.name = 'CarviApiError';
  }
}

/** Calls go to the local demo server, which adds the token and forwards to Carvi. */
export const carvi = axios.create({ baseURL: '/api/carvi', headers: { Accept: 'application/json' } });

carvi.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorEnvelope>) => {
    const envelope = error.response?.data?.error;
    if (envelope && error.response) {
      return Promise.reject(new CarviApiError(error.response.status, envelope.code, envelope.message, envelope.details, envelope.requestId));
    }
    return Promise.reject(new CarviApiError(error.response?.status ?? 0, 'NETWORK_ERROR', error.message));
  },
);

/** Local-only endpoints of the demo server (config, log, events). */
export const local = axios.create({ baseURL: '/api' });
```

`src/api/requests.ts`:
```ts
import { carvi, local } from './client';
import type {
  AvailabilityParams, AvailabilityResponse, Booking, BookingInput, BookingsFilter, CancelResult, HealthResponse, Paged, PaymentInput, Quote, QuoteInput, ServerConfig, Vehicle,
} from './types';

export const getServerConfig = async () => (await local.get<ServerConfig>('/config')).data;
export const getHealth = async () => (await carvi.get<HealthResponse>('/health')).data;
export const listVehicles = async (page: number, limit: number) => (await carvi.get<Paged<Vehicle>>('/vehicles', { params: { page, limit } })).data;
export const getVehicle = async (id: string) => (await carvi.get<Vehicle>(`/vehicles/${id}`)).data;
export const getAvailability = async (params: AvailabilityParams) =>
  (await carvi.get<AvailabilityResponse>('/availability', { params: { ...params, vehicleIds: params.vehicleIds.join(',') } })).data;
export const createQuote = async (input: QuoteInput) => (await carvi.post<Quote>('/quotes', input)).data;
export const createBooking = async (input: BookingInput, idempotencyKey: string) =>
  (await carvi.post<Booking>('/bookings', input, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
export const listBookings = async (filter: BookingsFilter) => {
  const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== ''));
  return (await carvi.get<Paged<Booking>>('/bookings', { params })).data;
};
export const getBooking = async (id: string) => (await carvi.get<Booking>(`/bookings/${id}`)).data;
export const confirmBooking = async (id: string, payment: PaymentInput, idempotencyKey: string) =>
  (await carvi.post<Booking>(`/bookings/${id}/confirm`, { payment }, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
export const cancelBooking = async (id: string, reason: string | undefined, idempotencyKey: string) =>
  (await carvi.post<CancelResult>(`/bookings/${id}/cancel`, reason ? { reason } : {}, { headers: { 'Idempotency-Key': idempotencyKey } })).data;
```

- [ ] **Step 5: Write `src/api/hooks.ts`**

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CarviApiError } from './client';
import * as api from './requests';
import type { AvailabilityParams, Booking, BookingInput, BookingsFilter, CancelResult, PaymentInput, Quote, QuoteInput } from './types';

export const useServerConfig = () => useQuery({ queryKey: ['config'], queryFn: api.getServerConfig, staleTime: Infinity });
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.getHealth, retry: false });
export const useVehicles = (page: number, limit = 12) =>
  useQuery({ queryKey: ['vehicles', page, limit], queryFn: () => api.listVehicles(page, limit), placeholderData: keepPreviousData });
export const useVehicle = (id?: string) => useQuery({ queryKey: ['vehicle', id], queryFn: () => api.getVehicle(id as string), enabled: !!id });
export const useAvailability = (params: AvailabilityParams | null) =>
  useQuery({
    queryKey: ['availability', params],
    queryFn: () => api.getAvailability(params as AvailabilityParams),
    enabled: !!params && params.vehicleIds.length > 0,
    staleTime: 0,
    retry: false,
  });
export const useCreateQuote = () => useMutation<Quote, CarviApiError, QuoteInput>({ mutationFn: api.createQuote });
export const useBookings = (filter: BookingsFilter) =>
  useQuery({ queryKey: ['bookings', filter], queryFn: () => api.listBookings(filter), placeholderData: keepPreviousData });
export const useBooking = (id?: string) => useQuery({ queryKey: ['booking', id], queryFn: () => api.getBooking(id as string), enabled: !!id });

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, CarviApiError, { input: BookingInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => api.createBooking(input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
export function useConfirmBooking() {
  const queryClient = useQueryClient();
  return useMutation<Booking, CarviApiError, { id: string; payment: PaymentInput; idempotencyKey: string }>({
    mutationFn: ({ id, payment, idempotencyKey }) => api.confirmBooking(id, payment, idempotencyKey),
    onSuccess: (booking) => {
      queryClient.setQueryData(['booking', booking.id], booking);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation<CancelResult, CarviApiError, { id: string; reason?: string; idempotencyKey: string }>({
    mutationFn: ({ id, reason, idempotencyKey }) => api.cancelBooking(id, reason, idempotencyKey),
    onSuccess: (result) => {
      queryClient.setQueryData(['booking', result.booking.id], result.booking);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
```

- [ ] **Step 6: Write the UI kit `src/components/ui.tsx`, `StatusBadge.tsx`, `Pagination.tsx`**

`src/components/ui.tsx`:
```tsx
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const buttonVariants: Record<Variant, string> = {
  primary: 'bg-carvi text-white hover:bg-sky-600 disabled:bg-sky-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

export function Button({ variant = 'primary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn('inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed', buttonVariants[variant], className)}
      {...rest}
    />
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)} {...rest} />;
}

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue';
const badgeTones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
};
export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', badgeTones[tone], className)} {...rest} />;
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-carvi focus:outline-none focus:ring-1 focus:ring-carvi', className)} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-carvi focus:outline-none focus:ring-1 focus:ring-carvi', className)} {...rest} />;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return <pre className={cn('max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100', className)}>{JSON.stringify(value, null, 2)}</pre>;
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-slate-500 hover:text-slate-800" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-carvi" />{label}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
```

`src/components/StatusBadge.tsx`:
```tsx
import type { BookingStatus } from '../api/types';
import { Badge, type Tone } from './ui';

const tones: Record<BookingStatus, Tone> = { HOLD: 'amber', EXPIRED: 'neutral', CONFIRMED: 'green', STARTED: 'blue', COMPLETED: 'blue', CANCELLED: 'red' };
const labels: Record<BookingStatus, string> = { HOLD: 'En hold', EXPIRED: 'Vencida', CONFIRMED: 'Confirmada', STARTED: 'En curso', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={tones[status] ?? 'neutral'}>{labels[status] ?? status}</Badge>;
}
```

`src/components/Pagination.tsx`:
```tsx
import type { PageMeta } from '../api/types';
import { Button } from './ui';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>Página {meta.page} de {Math.max(meta.totalPages, 1)} · {meta.total} en total</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Write `src/components/Layout.tsx`, `src/pages/StatusPage.tsx`, `src/router.tsx`, `src/App.tsx`**

`src/components/Layout.tsx`:
```tsx
import { Activity, Car, CalendarPlus, ListOrdered, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from './ui';

const NAV = [
  { to: '/', label: 'Estado', icon: Activity, end: true },
  { to: '/catalogo', label: 'Catálogo', icon: Car },
  { to: '/reservar', label: 'Reservar', icon: CalendarPlus },
  { to: '/reservas', label: 'Reservas', icon: ListOrdered },
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
];

export function Layout({ techPanel }: { techPanel?: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="mb-6">
          <div className="text-lg font-bold text-carvi">Demo de socio</div>
          <div className="text-xs text-slate-500">API de integración de Carvi</div>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm', isActive ? 'bg-sky-50 font-semibold text-carvi' : 'text-slate-700 hover:bg-slate-100')}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
      {techPanel}
    </div>
  );
}
```

`src/pages/StatusPage.tsx`:
```tsx
import { useHealth, useServerConfig } from '../api/hooks';
import { CarviApiError } from '../api/client';
import { fmtDateTime } from '../lib/dates';
import { Badge, Button, Card, PageTitle, Spinner } from '../components/ui';

export function StatusPage() {
  const health = useHealth();
  const config = useServerConfig();
  return (
    <>
      <PageTitle
        title="Estado"
        subtitle="GET /health confirma contra qué entorno y con qué credencial opera el demo."
        actions={<Button variant="secondary" onClick={() => health.refetch()} disabled={health.isFetching}>Comprobar de nuevo</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Salud de la API</h2>
          {health.isPending && <Spinner />}
          {health.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              {health.error instanceof CarviApiError ? `${health.error.code} · ${health.error.message}` : String(health.error)}
              {health.error instanceof CarviApiError && health.error.code === 'UPSTREAM_UNREACHABLE' && config.data && (
                <p className="mt-1">No hay conexión con la API de Carvi. ¿Está el backend arrancado en {config.data.apiBaseUrl}?</p>
              )}
            </div>
          )}
          {health.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Estado</dt><dd><Badge tone="green">{health.data.status}</Badge></dd>
              <dt className="text-slate-500">Entorno</dt><dd><Badge tone={health.data.environment === 'production' ? 'green' : 'amber'}>{health.data.environment}</Badge></dd>
              <dt className="text-slate-500">Base de datos</dt><dd><Badge tone={health.data.database === 'up' ? 'green' : 'red'}>{health.data.database}</Badge></dd>
              <dt className="text-slate-500">Hora del servidor</dt><dd>{fmtDateTime(health.data.time)}</dd>
              <dt className="text-slate-500">Credencial</dt><dd className="font-mono text-xs">{health.data.credential.clientId}</dd>
              <dt className="text-slate-500">Scopes</dt><dd className="flex gap-1">{health.data.credential.scopes.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}</dd>
            </dl>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Configuración del demo</h2>
          {config.isPending && <Spinner />}
          {config.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">API de Carvi</dt><dd className="font-mono text-xs">{config.data.apiBaseUrl}</dd>
              <dt className="text-slate-500">client_id</dt><dd className="font-mono text-xs">{config.data.clientId}</dd>
              <dt className="text-slate-500">URL de webhook</dt><dd className="font-mono text-xs">{config.data.webhookUrl}</dd>
              <dt className="text-slate-500">Secretos de webhook</dt>
              <dd>{config.data.webhookSecretsConfigured > 0 ? <Badge tone="green">{config.data.webhookSecretsConfigured} configurado(s)</Badge> : <Badge tone="amber">ninguno · las entregas se marcarán sin verificar</Badge>}</dd>
            </dl>
          )}
          <p className="mt-4 text-xs text-slate-500">Configura la URL de webhook en la credencial desde el portal de integraciones y copia su secreto en <code>CARVI_WEBHOOK_SECRETS</code>.</p>
        </Card>
      </div>
    </>
  );
}
```

`src/router.tsx` (pages for other routes are added in later tasks; start with placeholders that the tasks replace):
```tsx
import { createBrowserRouter } from 'react-router-dom';
import { Layout } from './components/Layout';
import { StatusPage } from './pages/StatusPage';

const Soon = ({ name }: { name: string }) => <p className="text-slate-500">{name}: pendiente.</p>;

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <StatusPage /> },
      { path: '/catalogo', element: <Soon name="Catálogo" /> },
      { path: '/catalogo/:id', element: <Soon name="Vehículo" /> },
      { path: '/reservar', element: <Soon name="Reservar" /> },
      { path: '/reservas', element: <Soon name="Reservas" /> },
      { path: '/webhooks', element: <Soon name="Webhooks" /> },
    ],
  },
]);
```

`src/App.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { router } from './router';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build && npm test` → all green.
Run `npm run dev`, open `http://localhost:5176`: Estado shows environment `sandbox`, scopes and config. Stop with the backend down: the card shows the `UPSTREAM_UNREACHABLE` message with the base URL.
```bash
git add src
git commit -m "feat(web): API layer, UI kit, layout and status page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Technical panel (live HTTP exchanges)

**Files:**
- Create: `src/components/tech-panel/TechPanelContext.tsx`, `src/components/tech-panel/TechPanel.tsx`
- Modify: `src/router.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `useEventSource`, `local`, `Layout({ techPanel })`.
- Produces: `TechPanelProvider`, `useTechPanel(): { exchanges: Exchange[]; open: boolean; setOpen(v: boolean): void; clear(): void; connected: boolean }`, `interface Exchange` (mirror of the server type).

- [ ] **Step 1: Write `TechPanelContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { local } from '../../api/client';
import { useEventSource } from '../../lib/sse';

export interface Exchange {
  id: string;
  at: string;
  method: string;
  path: string;
  query: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

interface TechPanelState {
  exchanges: Exchange[];
  open: boolean;
  setOpen: (open: boolean) => void;
  clear: () => void;
  connected: boolean;
}

const TechPanelContext = createContext<TechPanelState | null>(null);
const MAX = 200;

export function TechPanelProvider({ children }: { children: ReactNode }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    local.get<Exchange[]>('/log').then((res) => setExchanges(res.data)).catch(() => undefined);
  }, []);

  const { connected } = useEventSource<Exchange>('/api/log/stream', (exchange) => {
    setExchanges((prev) => [exchange, ...prev].slice(0, MAX));
    // Contract errors open the panel so nobody has to hunt for them.
    if (exchange.status >= 400 || exchange.status === 0) setOpen(true);
  });

  const clear = useCallback(() => setExchanges([]), []);
  const value = useMemo(() => ({ exchanges, open, setOpen, clear, connected }), [exchanges, open, clear, connected]);
  return <TechPanelContext.Provider value={value}>{children}</TechPanelContext.Provider>;
}

export function useTechPanel(): TechPanelState {
  const ctx = useContext(TechPanelContext);
  if (!ctx) throw new Error('useTechPanel must be used inside TechPanelProvider');
  return ctx;
}
```

- [ ] **Step 2: Write `TechPanel.tsx`**

```tsx
import { ChevronDown, ChevronRight, Terminal, X } from 'lucide-react';
import { useState } from 'react';
import { fmtTime } from '../../lib/dates';
import { Badge, Button, JsonBlock, cn } from '../ui';
import { useTechPanel, type Exchange } from './TechPanelContext';

const statusTone = (status: number) => (status === 0 || status >= 500 ? 'red' : status >= 400 ? 'amber' : 'green');

function errorCode(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { code?: unknown } }).error;
    if (error && typeof error.code === 'string') return error.code;
  }
  return null;
}

const INTERESTING_REQUEST = ['Idempotency-Key', 'X-Request-Id', 'Authorization'];
const INTERESTING_RESPONSE = ['x-request-id', 'idempotent-replayed', 'retry-after', 'cache-control'];

function pick(headers: Record<string, string>, names: string[]) {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => names.some((n) => n.toLowerCase() === k.toLowerCase())));
}

function ExchangeRow({ exchange }: { exchange: Exchange }) {
  const [expanded, setExpanded] = useState(false);
  const code = errorCode(exchange.responseBody);
  const replayed = exchange.responseHeaders['idempotent-replayed'] === 'true';
  const query = Object.entries(exchange.query).map(([k, v]) => `${k}=${v}`).join('&');
  return (
    <div className="border-b border-slate-200">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="w-14 font-mono font-semibold">{exchange.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono">{exchange.path}{query && `?${query}`}</span>
        {replayed && <Badge tone="blue">replayed</Badge>}
        {code && <Badge tone="red">{code}</Badge>}
        <Badge tone={statusTone(exchange.status)}>{exchange.status || 'sin respuesta'}</Badge>
        <span className="w-16 text-right text-slate-400">{exchange.durationMs} ms</span>
        <span className="text-slate-400">{fmtTime(exchange.at)}</span>
      </button>
      {expanded && (
        <div className="space-y-2 bg-slate-50 px-3 pb-3 text-xs">
          <div>
            <div className="mb-1 font-semibold text-slate-600">Petición</div>
            <JsonBlock value={{ headers: pick(exchange.requestHeaders, INTERESTING_REQUEST), body: exchange.requestBody }} className="max-h-60" />
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-600">Respuesta</div>
            <JsonBlock value={{ headers: pick(exchange.responseHeaders, INTERESTING_RESPONSE), body: exchange.responseBody }} className="max-h-72" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TechPanel() {
  const { exchanges, open, setOpen, clear, connected } = useTechPanel();
  return (
    <>
      <button
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg hover:bg-slate-700"
        onClick={() => setOpen(!open)}
        aria-label="Panel técnico"
      >
        <Terminal size={16} /> Panel técnico <Badge tone="neutral">{exchanges.length}</Badge>
      </button>
      <aside className={cn('fixed inset-y-0 right-0 z-20 flex w-[520px] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl transition-transform', open ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            Peticiones a Carvi
            <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} title={connected ? 'conectado' : 'reconectando'} />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={clear}>Limpiar</Button>
            <Button variant="ghost" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {exchanges.length === 0 && <p className="p-4 text-sm text-slate-500">Todavía no hay peticiones. Cada llamada a la API aparecerá aquí con sus cabeceras y cuerpos.</p>}
          {exchanges.map((exchange) => <ExchangeRow key={exchange.id} exchange={exchange} />)}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Mount it**

In `src/router.tsx` change the layout element to `element: <Layout techPanel={<TechPanel />} />` (import from `./components/tech-panel/TechPanel`). In `src/App.tsx` wrap the router: `<TechPanelProvider><RouterProvider router={router} /></TechPanelProvider>` (import from `./components/tech-panel/TechPanelContext`).

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build`. In the browser: the floating button shows the count; opening lists the token request (`Authorization: "Bearer ****"`, `client_secret: "****"`) and `/health`; press "Comprobar de nuevo" and the new row arrives live. Stop the backend and press again: the panel opens on its own with the `UPSTREAM_UNREACHABLE` row.
```bash
git add src
git commit -m "feat(web): technical panel with live HTTP exchanges

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: Catálogo and vehicle detail

**Files:**
- Create: `src/components/VehicleCard.tsx`, `src/pages/CatalogPage.tsx`, `src/pages/VehiclePage.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `useVehicles`, `useVehicle`, `Pagination`, `money`.
- Produces: `VehicleCard({ vehicle, footer?, onClick?, disabled?, className? })` reused by the wizard (Task 10). Navigation to `/reservar?vehicleId=<id>` preselects a vehicle in the wizard.

- [ ] **Step 1: Write `src/components/VehicleCard.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { Vehicle } from '../api/types';
import { money } from '../lib/format';
import { Badge, Card, cn } from './ui';

interface Props {
  vehicle: Vehicle;
  footer?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
}

export function VehicleCard({ vehicle, footer, onClick, disabled, selected, className }: Props) {
  return (
    <Card
      className={cn('flex flex-col gap-2 p-0 overflow-hidden', onClick && !disabled && 'cursor-pointer hover:shadow-md', disabled && 'opacity-50', selected && 'ring-2 ring-carvi', className)}
      onClick={disabled ? undefined : onClick}
    >
      <img src={vehicle.images.main} alt={`${vehicle.brand} ${vehicle.model}`} className="h-40 w-full object-cover" loading="lazy" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold">{vehicle.brand} {vehicle.model} <span className="font-normal text-slate-500">{vehicle.year}</span></div>
          <div className="text-right text-sm"><span className="font-semibold">{money(vehicle.rateDay)}</span><span className="text-slate-500">/día</span></div>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          <Badge>{vehicle.type}</Badge><Badge>{vehicle.transmission}</Badge><Badge>{vehicle.seats} plazas</Badge>{vehicle.airConditioning && <Badge>A/C</Badge>}
        </div>
        <div className="text-xs text-slate-500">★ {vehicle.rating.average.toFixed(1)} ({vehicle.rating.count}) · {vehicle.host.displayName}</div>
        {footer}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Write `src/pages/CatalogPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehicles } from '../api/hooks';
import { Pagination } from '../components/Pagination';
import { VehicleCard } from '../components/VehicleCard';
import { EmptyState, PageTitle, Spinner } from '../components/ui';
import { notifyError } from '../lib/notify';

export function CatalogPage() {
  const [page, setPage] = useState(1);
  const vehicles = useVehicles(page);
  const navigate = useNavigate();
  useEffect(() => {
    if (vehicles.error) notifyError(vehicles.error);
  }, [vehicles.error]);
  return (
    <>
      <PageTitle title="Catálogo" subtitle="GET /vehicles · vehículos publicados. Requiere el scope catalog:read; la respuesta se cachea 15 minutos." />
      {vehicles.isPending && <Spinner />}
      {vehicles.data && vehicles.data.data.length === 0 && <EmptyState>No hay vehículos publicados.</EmptyState>}
      {vehicles.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vehicles.data.data.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} onClick={() => navigate(`/catalogo/${vehicle.id}`)} />
            ))}
          </div>
          <Pagination meta={vehicles.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Write `src/pages/VehiclePage.tsx`**

```tsx
import { Fragment } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useVehicle } from '../api/hooks';
import { CarviApiError } from '../api/client';
import { Badge, Button, Card, PageTitle, Spinner } from '../components/ui';
import { money } from '../lib/format';

export function VehiclePage() {
  const { id } = useParams<{ id: string }>();
  const vehicle = useVehicle(id);
  const navigate = useNavigate();
  if (vehicle.isPending) return <Spinner />;
  if (vehicle.error) {
    const message = vehicle.error instanceof CarviApiError ? `${vehicle.error.code} · ${vehicle.error.message}` : String(vehicle.error);
    return <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{message} · <Link className="underline" to="/catalogo">Volver al catálogo</Link></div>;
  }
  const v = vehicle.data;
  const specs: Array<[string, string]> = [
    ['Tipo', v.type], ['Transmisión', v.transmission], ['Plazas', String(v.seats)], ['Aire acondicionado', v.airConditioning ? 'Sí' : 'No'],
    ['Consumo', String(v.consumption)], ['Valoración', `★ ${v.rating.average.toFixed(1)} (${v.rating.count})`], ['Anfitrión', v.host.displayName], ['Estado', v.status],
  ];
  return (
    <>
      <PageTitle
        title={`${v.brand} ${v.model} ${v.year}`}
        subtitle={`GET /vehicles/${v.id}`}
        actions={<Button onClick={() => navigate(`/reservar?vehicleId=${v.id}`)}>Reservar este vehículo</Button>}
      />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card className="p-0 overflow-hidden">
          <img src={v.images.main} alt="" className="h-72 w-full object-cover" />
          {v.images.gallery.length > 0 && (
            <div className="flex gap-2 overflow-x-auto p-3">
              {v.images.gallery.map((src) => <img key={src} src={src} alt="" className="h-20 w-28 shrink-0 rounded object-cover" loading="lazy" />)}
            </div>
          )}
        </Card>
        <Card>
          <div className="mb-3 text-2xl font-semibold">{money(v.rateDay)} <span className="text-sm font-normal text-slate-500">por día · {v.currency}</span></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {specs.map(([label, value]) => <Fragment key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></Fragment>)}
          </dl>
          <div className="mt-3"><Badge>id: {v.id}</Badge></div>
        </Card>
      </div>
    </>
  );
}
```
- [ ] **Step 4: Register the routes**

In `src/router.tsx` replace the two catalog placeholders with `{ path: '/catalogo', element: <CatalogPage /> }` and `{ path: '/catalogo/:id', element: <VehiclePage /> }` (imports from `./pages/CatalogPage` and `./pages/VehiclePage`).

- [ ] **Step 5: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build`. Browser: grid with images, pagination works, card → detail with gallery; the technical panel shows `cache-control: private, max-age=900` on `/vehicles`. A bad id (`/catalogo/xyz`) shows `VEHICLE_NOT_FOUND` and the panel opens.
```bash
git add src
git commit -m "feat(web): vehicle catalog and detail pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Booking wizard, steps 1–3 (period, vehicle + availability, quote)

**Files:**
- Create: `src/pages/wizard/wizardState.ts`, `src/pages/wizard/StepPeriod.tsx`, `src/pages/wizard/StepVehicle.tsx`, `src/pages/wizard/StepQuote.tsx`, `src/pages/wizard/PricingTable.tsx`, `src/pages/wizard/BookingWizardPage.tsx`
- Modify: `src/router.tsx`
- Test: `src/pages/wizard/wizardState.test.ts`

**Interfaces:**
- Produces:
  - `type Step = 1|2|3|4|5`; `interface WizardState { step; period: PeriodInput; vehicle: Vehicle|null; quote: Quote|null; booking: Booking|null; keys: { booking: string; confirm: string; cancel: string } }`
  - `type WizardAction = { type:'SET_PERIOD'; period } | { type:'SELECT_VEHICLE'; vehicle } | { type:'SET_QUOTE'; quote } | { type:'SET_BOOKING'; booking } | { type:'GO_TO'; step } | { type:'RESET' } | { type:'REUSE_QUOTE' }`
  - `wizardReducer`, `initialWizardState()`, `PricingTable({ pricing })`.
  - Steps 4–5 are placeholders here and are implemented in Task 11.

- [ ] **Step 1: Write the failing reducer test**

`src/pages/wizard/wizardState.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Booking, Quote, Vehicle } from '../../api/types';
import { initialWizardState, wizardReducer } from './wizardState';

const vehicle = { id: 'v1' } as Vehicle;
const quote = { quoteId: 'q1' } as Quote;
const booking = { id: 'b1' } as Booking;

describe('wizardReducer', () => {
  it('starts on step 1 with a valid default period and fresh keys', () => {
    const state = initialWizardState();
    expect(state.step).toBe(1);
    expect(state.keys.booking).toMatch(/[0-9a-f-]{36}/);
    expect(state.keys.booking).not.toBe(state.keys.confirm);
  });
  it('changing the period clears vehicle and quote and goes to step 2', () => {
    let state = wizardReducer(initialWizardState(), { type: 'SELECT_VEHICLE', vehicle });
    state = wizardReducer(state, { type: 'SET_QUOTE', quote });
    state = wizardReducer(state, { type: 'SET_PERIOD', period: { from: '2026-10-10', to: '2026-10-14', startTime: '10:00', endTime: '10:00' } });
    expect(state).toMatchObject({ step: 2, vehicle: null, quote: null });
  });
  it('selecting a vehicle clears the quote and goes to step 3; a quote stays on step 3', () => {
    let state = wizardReducer(initialWizardState(), { type: 'SELECT_VEHICLE', vehicle });
    expect(state.step).toBe(3);
    state = wizardReducer(state, { type: 'SET_QUOTE', quote });
    expect(state).toMatchObject({ step: 3, quote });
  });
  it('a booking goes to step 5; REUSE_QUOTE keeps the quote, drops the booking, rotates keys and goes to step 4', () => {
    let state = wizardReducer(initialWizardState(), { type: 'SELECT_VEHICLE', vehicle });
    state = wizardReducer(state, { type: 'SET_QUOTE', quote });
    state = wizardReducer(state, { type: 'SET_BOOKING', booking });
    expect(state.step).toBe(5);
    const oldKeys = state.keys;
    state = wizardReducer(state, { type: 'REUSE_QUOTE' });
    expect(state).toMatchObject({ step: 4, quote, booking: null });
    expect(state.keys.booking).not.toBe(oldKeys.booking);
  });
  it('RESET returns to a fresh state', () => {
    const state = wizardReducer(wizardReducer(initialWizardState(), { type: 'SELECT_VEHICLE', vehicle }), { type: 'RESET' });
    expect(state).toMatchObject({ step: 1, vehicle: null });
  });
});
```

Run: `npx vitest run src/pages/wizard` → FAIL (module not found).

- [ ] **Step 2: Implement `wizardState.ts`**

```ts
import type { Booking, Quote, Vehicle } from '../../api/types';
import { defaultPeriod, type PeriodInput } from '../../lib/dates';
import { newIdempotencyKey } from '../../lib/idempotency';

export type Step = 1 | 2 | 3 | 4 | 5;

export interface WizardKeys { booking: string; confirm: string; cancel: string }

export interface WizardState {
  step: Step;
  period: PeriodInput;
  vehicle: Vehicle | null;
  quote: Quote | null;
  booking: Booking | null;
  /** One idempotency key per logical operation of this booking attempt. */
  keys: WizardKeys;
}

export type WizardAction =
  | { type: 'SET_PERIOD'; period: PeriodInput }
  | { type: 'SELECT_VEHICLE'; vehicle: Vehicle }
  | { type: 'SET_QUOTE'; quote: Quote }
  | { type: 'SET_BOOKING'; booking: Booking }
  | { type: 'GO_TO'; step: Step }
  | { type: 'RESET' }
  | { type: 'REUSE_QUOTE' };

const freshKeys = (): WizardKeys => ({ booking: newIdempotencyKey(), confirm: newIdempotencyKey(), cancel: newIdempotencyKey() });

export function initialWizardState(): WizardState {
  return { step: 1, period: defaultPeriod(), vehicle: null, quote: null, booking: null, keys: freshKeys() };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PERIOD':
      return { ...state, period: action.period, vehicle: null, quote: null, step: 2 };
    case 'SELECT_VEHICLE':
      return { ...state, vehicle: action.vehicle, quote: null, step: 3 };
    case 'SET_QUOTE':
      return { ...state, quote: action.quote, step: 3 };
    case 'SET_BOOKING':
      return { ...state, booking: action.booking, step: 5 };
    case 'GO_TO':
      return { ...state, step: action.step };
    case 'RESET':
      return initialWizardState();
    case 'REUSE_QUOTE':
      return { ...state, booking: null, keys: freshKeys(), step: 4 };
  }
}

export const STEP_TITLES: Record<Step, string> = { 1: 'Periodo', 2: 'Vehículo', 3: 'Cotización', 4: 'Cliente y lugares', 5: 'Reserva' };
```

Run: `npx vitest run src/pages/wizard` → 5 passed.

- [ ] **Step 3: Write `PricingTable.tsx` and `StepPeriod.tsx`**

`src/pages/wizard/PricingTable.tsx`:
```tsx
import type { Pricing } from '../../api/types';
import { money } from '../../lib/format';

export function PricingTable({ pricing }: { pricing: Pricing }) {
  const rows: Array<[string, string]> = [
    ['Tarifa por día', money(pricing.rateDay)],
    ['Días facturados', `${pricing.totalDays} (${pricing.totalHours} h)`],
    ['Subtotal', money(pricing.subtotal)],
    ['Anticipo', money(pricing.advance)],
    ['Cargo de servicio', money(pricing.serviceFee)],
    ['Total de la renta', money(pricing.total)],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-slate-100"><td className="py-1 text-slate-500">{label}</td><td className="py-1 text-right">{value}</td></tr>
        ))}
        <tr className="font-semibold"><td className="py-2">amountDue · lo que el canal paga a Carvi</td><td className="py-2 text-right text-carvi">{money(pricing.amountDue)} {pricing.currency}</td></tr>
      </tbody>
    </table>
  );
}
```

`src/pages/wizard/StepPeriod.tsx`:
```tsx
import { useState, type ChangeEvent } from 'react';
import { Button, Card, Field, Input } from '../../components/ui';
import { calendarDaysInclusive, MIN_RENT_DAYS, type PeriodInput } from '../../lib/dates';

export function StepPeriod({ period, onNext }: { period: PeriodInput; onNext: (period: PeriodInput) => void }) {
  const [form, setForm] = useState(period);
  const days = form.from && form.to ? calendarDaysInclusive(form.from, form.to) : 0;
  const tooShort = days > 0 && days < MIN_RENT_DAYS;
  const set = (key: keyof PeriodInput) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  return (
    <Card className="max-w-xl">
      <p className="mb-4 text-sm text-slate-600">Fechas en <code>YYYY-MM-DD</code> (zona America/El_Salvador) y horas <code>HH:mm</code>. Son los parámetros de <code>GET /availability</code> y <code>POST /quotes</code>.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde"><Input type="date" value={form.from} onChange={set('from')} /></Field>
        <Field label="Hasta"><Input type="date" value={form.to} onChange={set('to')} /></Field>
        <Field label="Hora de entrega"><Input type="time" value={form.startTime} onChange={set('startTime')} /></Field>
        <Field label="Hora de devolución"><Input type="time" value={form.endTime} onChange={set('endTime')} /></Field>
      </div>
      <p className={tooShort ? 'mt-3 text-sm text-amber-700' : 'mt-3 text-sm text-slate-500'}>
        {days > 0 ? `${days} día(s) de calendario.` : ''}{' '}
        {tooShort && `La renta debe tener mínimo ${MIN_RENT_DAYS} días (to − from + 1). Puedes continuar igual para ver el 400 VALIDATION_ERROR real al cotizar.`}
      </p>
      <div className="mt-4 flex justify-end">
        <Button disabled={!form.from || !form.to || !form.startTime || !form.endTime} onClick={() => onNext(form)}>Buscar disponibilidad</Button>
      </div>
    </Card>
  );
}
```
- [ ] **Step 4: Write `StepVehicle.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useAvailability, useVehicles } from '../../api/hooks';
import type { AvailabilityRow, Vehicle } from '../../api/types';
import { Pagination } from '../../components/Pagination';
import { VehicleCard } from '../../components/VehicleCard';
import { Badge, Button, Spinner } from '../../components/ui';
import type { PeriodInput } from '../../lib/dates';
import { notifyError } from '../../lib/notify';

interface Props {
  period: PeriodInput;
  preselectedId?: string;
  onBack: () => void;
  onSelect: (vehicle: Vehicle) => void;
}

const reasonLabel: Record<NonNullable<AvailabilityRow['reason']>, string> = { BOOKED: 'Reservado', BLOCKED: 'Bloqueado', NOT_FOUND: 'No publicado' };

export function StepVehicle({ period, preselectedId, onBack, onSelect }: Props) {
  const [page, setPage] = useState(1);
  const vehicles = useVehicles(page);
  const ids = useMemo(() => vehicles.data?.data.map((v) => v.id) ?? [], [vehicles.data]);
  const availability = useAvailability(ids.length ? { vehicleIds: ids, ...period } : null);
  useEffect(() => {
    if (availability.error) notifyError(availability.error);
  }, [availability.error]);
  const rows = new Map(availability.data?.data.map((row) => [row.vehicleId, row]));
  return (
    <>
      <div className="mb-3 flex items-center justify-between text-sm text-slate-600">
        <span>
          <code>GET /availability</code> sobre los vehículos de esta página ·{' '}
          {availability.data ? `colchón de ${availability.data.meta.gapHours} h entre reservas · ${availability.data.meta.timezone}` : availability.isFetching ? 'consultando…' : ''}
        </span>
        <Button variant="secondary" onClick={onBack}>Cambiar periodo</Button>
      </div>
      {vehicles.isPending && <Spinner />}
      {vehicles.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {vehicles.data.data.map((vehicle) => {
              const row = rows.get(vehicle.id);
              const available = row?.available ?? false;
              return (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  disabled={!available}
                  selected={vehicle.id === preselectedId}
                  onClick={() => onSelect(vehicle)}
                  footer={
                    <div className="mt-1">
                      {!row && availability.isFetching && <Badge>comprobando…</Badge>}
                      {row && available && <Badge tone="green">Disponible</Badge>}
                      {row && !available && <Badge tone="red">{row.reason ? reasonLabel[row.reason] : 'No disponible'}</Badge>}
                    </div>
                  }
                />
              );
            })}
          </div>
          <Pagination meta={vehicles.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Write `StepQuote.tsx`**

```tsx
import { useEffect } from 'react';
import { useCreateQuote } from '../../api/hooks';
import type { Quote, Vehicle } from '../../api/types';
import { Badge, Button, Card, Spinner } from '../../components/ui';
import { mmss, useCountdown } from '../../lib/countdown';
import { fmtDate, type PeriodInput } from '../../lib/dates';
import { notifyError } from '../../lib/notify';
import { PricingTable } from './PricingTable';

interface Props {
  vehicle: Vehicle;
  period: PeriodInput;
  quote: Quote | null;
  onQuote: (quote: Quote) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepQuote({ vehicle, period, quote, onQuote, onBack, onNext }: Props) {
  const create = useCreateQuote();
  const countdown = useCountdown(quote?.expiresAt);
  const request = () =>
    create.mutate({ vehicleId: vehicle.id, ...period }, { onSuccess: onQuote, onError: notifyError });
  useEffect(() => {
    if (!quote) request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Card className="max-w-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{vehicle.brand} {vehicle.model} {vehicle.year}</div>
          <div className="text-sm text-slate-500">{fmtDate(period.from)} {period.startTime} → {fmtDate(period.to)} {period.endTime}</div>
        </div>
        <Button variant="secondary" onClick={onBack}>Cambiar vehículo</Button>
      </div>
      <p className="mb-3 text-sm text-slate-600"><code>POST /quotes</code> no bloquea el vehículo ni comprueba disponibilidad; la cotización vence a los 15 minutos y no se consume al reservar.</p>
      {create.isPending && <Spinner label="Cotizando…" />}
      {create.error && !quote && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {create.error.code} · {create.error.message}
          {create.error.code === 'VALIDATION_ERROR' && <p className="mt-1">Vuelve al periodo y elige un rango de al menos 5 días.</p>}
          <div className="mt-2 flex gap-2"><Button variant="secondary" onClick={onBack}>Volver</Button><Button onClick={request}>Reintentar</Button></div>
        </div>
      )}
      {quote && (
        <>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <Badge>quoteId: {quote.quoteId}</Badge>
            {countdown.expired ? <Badge tone="red">Cotización vencida</Badge> : <Badge tone="amber">Vence en {mmss(countdown.secondsLeft)}</Badge>}
          </div>
          <PricingTable pricing={quote.pricing} />
          <div className="mt-4 flex justify-end gap-2">
            {countdown.expired ? <Button onClick={request}>Volver a cotizar</Button> : <Button onClick={onNext}>Continuar con el cliente</Button>}
          </div>
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: Write `BookingWizardPage.tsx` (steps 4 and 5 as placeholders, replaced in Task 11)**

```tsx
import { useReducer } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageTitle, cn } from '../../components/ui';
import { StepPeriod } from './StepPeriod';
import { StepQuote } from './StepQuote';
import { StepVehicle } from './StepVehicle';
import { initialWizardState, STEP_TITLES, wizardReducer, type Step } from './wizardState';

export function BookingWizardPage() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [params] = useSearchParams();
  const preselectedId = params.get('vehicleId') ?? undefined;
  const steps = [1, 2, 3, 4, 5] as Step[];
  return (
    <>
      <PageTitle title="Reservar" subtitle="El flujo de reserva de la guía: disponibilidad → cotización → hold de 15 minutos → confirmación con el pago del canal." />
      <ol className="mb-6 flex gap-2 text-sm">
        {steps.map((step) => (
          <li key={step} className={cn('rounded-full px-3 py-1', step === state.step ? 'bg-carvi text-white' : step < state.step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500')}>
            {step}. {STEP_TITLES[step]}
          </li>
        ))}
      </ol>
      {state.step === 1 && <StepPeriod period={state.period} onNext={(period) => dispatch({ type: 'SET_PERIOD', period })} />}
      {state.step === 2 && (
        <StepVehicle period={state.period} preselectedId={preselectedId} onBack={() => dispatch({ type: 'GO_TO', step: 1 })} onSelect={(vehicle) => dispatch({ type: 'SELECT_VEHICLE', vehicle })} />
      )}
      {state.step === 3 && state.vehicle && (
        <StepQuote
          vehicle={state.vehicle}
          period={state.period}
          quote={state.quote}
          onQuote={(quote) => dispatch({ type: 'SET_QUOTE', quote })}
          onBack={() => dispatch({ type: 'GO_TO', step: 2 })}
          onNext={() => dispatch({ type: 'GO_TO', step: 4 })}
        />
      )}
      {state.step >= 4 && <p className="text-slate-500">Pasos 4 y 5: pendientes (Task 11).</p>}
    </>
  );
}
```

Register in `src/router.tsx`: `{ path: '/reservar', element: <BookingWizardPage /> }` (import from `./pages/wizard/BookingWizardPage`).

- [ ] **Step 7: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build && npm test`. Browser: step 1 default period (5 days) → step 2 shows availability badges and `gapHours` → click a card → step 3 shows quote, countdown and pricing; a 4-day range shows the amber warning and, on quoting, the real `VALIDATION_ERROR` with `details {minDays, days}` in the panel. Opening `/reservar?vehicleId=<id>` highlights that card in step 2.
```bash
git add src
git commit -m "feat(web): booking wizard with availability and quote steps

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: Booking wizard, steps 4–5 and shared booking dialogs

**Files:**
- Create: `src/components/booking/types.ts`, `src/components/booking/BookingSummary.tsx`, `src/components/booking/ConfirmPaymentDialog.tsx`, `src/components/booking/CancelBookingDialog.tsx`, `src/pages/wizard/StepCustomer.tsx`, `src/pages/wizard/StepBooking.tsx`, `src/pages/wizard/guidance.ts`
- Modify: `src/pages/wizard/BookingWizardPage.tsx`

**Interfaces:**
- Consumes: `createBooking`, `confirmBooking`, `cancelBooking` (plain request functions), `useConfirmBooking`, `useCancelBooking`, `useCreateBooking`, `PricingTable`, `StatusBadge`, `useCountdown`, `newExternalPaymentId`, `round2`, `PLACES`.
- Produces (reused by Task 12):
  - `interface LastOperation { label: string; run: () => Promise<unknown> }`
  - `BookingSummary({ booking })`
  - `ConfirmPaymentDialog({ booking, idempotencyKey, open, onClose, onConfirmed(booking), onExecuted?(op) })`
  - `CancelBookingDialog({ booking, idempotencyKey, open, onClose, onCancelled(result), onExecuted?(op) })`
  - `guidanceFor(code: string): string | null`

- [ ] **Step 1: Write `src/components/booking/types.ts` and `guidance.ts`**

`src/components/booking/types.ts`:
```ts
/** The last request sent for a booking, kept so the user can resend it with the same idempotency key. */
export interface LastOperation {
  label: string;
  run: () => Promise<unknown>;
}
```

`src/pages/wizard/guidance.ts`:
```ts
const GUIDANCE: Record<string, string> = {
  VEHICLE_NOT_AVAILABLE: 'El vehículo se ocupó entre la cotización y la reserva. Vuelve al paso 2 y elige otro vehículo o rango.',
  QUOTE_EXPIRED: 'La cotización venció (15 minutos) o no es de tu canal. Vuelve a cotizar.',
  HOLD_EXPIRED: 'El hold venció hace más de 2 minutos. Reembolsa a tu cliente por tu lado y crea una reserva nueva.',
  CLIENT_DATA_CONFLICT: 'El teléfono ya pertenece a otro cliente (details.field). Cambia el dato marcado.',
  RATE_LIMITED: 'Límite por minuto superado. Espera los segundos de Retry-After (míralo en el panel técnico).',
  BOOKING_STATE_CONFLICT: 'La reserva no admite esa acción en su estado actual.',
  IDEMPOTENCY_MISMATCH: 'Misma Idempotency-Key con otro cuerpo: usa una clave nueva por operación lógica.',
  VALIDATION_ERROR: 'Revisa el cuerpo enviado; details indica qué falló.',
};

export const guidanceFor = (code: string): string | null => GUIDANCE[code] ?? null;
```

- [ ] **Step 2: Write `BookingSummary.tsx`**

```tsx
import type { Booking } from '../../api/types';
import { placeLabel } from '../../api/types';
import { fmtDate, fmtDateTime } from '../../lib/dates';
import { money } from '../../lib/format';
import { StatusBadge } from '../StatusBadge';
import { Badge } from '../ui';

export function BookingSummary({ booking }: { booking: Booking }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">{booking.confirmationCode}</span>
        <StatusBadge status={booking.status} />
        <Badge>canal {booking.channel}</Badge>
        {booking.externalReference && <Badge>ref. {booking.externalReference}</Badge>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-slate-500">Vehículo</dt><dd>{booking.vehicle.brand} {booking.vehicle.model} {booking.vehicle.year}</dd>
        <dt className="text-slate-500">Periodo</dt><dd>{fmtDate(booking.period.from)} {booking.period.startTime} → {fmtDate(booking.period.to)} {booking.period.endTime}</dd>
        <dt className="text-slate-500">Cliente</dt><dd>{booking.customer.fullName} · {booking.customer.email} · {booking.customer.phone} · {booking.customer.country}</dd>
        <dt className="text-slate-500">Entrega / devolución</dt><dd>{placeLabel(booking.pickup.location)} → {placeLabel(booking.dropoff.location)}</dd>
        <dt className="text-slate-500">amountDue</dt><dd className="font-semibold">{money(booking.pricing.amountDue)} {booking.pricing.currency}</dd>
        {booking.hold && <><dt className="text-slate-500">Hold hasta</dt><dd>{fmtDateTime(booking.hold.expiresAt)}</dd></>}
        {booking.payment && (
          <><dt className="text-slate-500">Pago del canal</dt><dd>{booking.payment.provider} · {booking.payment.externalPaymentId} · {money(booking.payment.amount)} · <Badge tone="blue">{booking.payment.status}</Badge></dd></>
        )}
        {booking.cancellation && (
          <><dt className="text-slate-500">Cancelación</dt><dd>{booking.cancellation.reason ?? '—'} · reembolsable {money(booking.cancellation.refundableAmount)}{booking.cancellation.at && ` · ${fmtDateTime(booking.cancellation.at)}`}</dd></>
        )}
        <dt className="text-slate-500">Creada</dt><dd>{fmtDateTime(booking.createdAt)}</dd>
      </dl>
    </div>
  );
}
```

- [ ] **Step 3: Write `ConfirmPaymentDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmBooking } from '../../api/hooks';
import { confirmBooking } from '../../api/requests';
import type { Booking, PaymentInput } from '../../api/types';
import { newExternalPaymentId } from '../../lib/idempotency';
import { money, round2 } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { Button, Field, Input, Modal } from '../ui';
import type { LastOperation } from './types';

interface Props {
  booking: Booking;
  idempotencyKey: string;
  open: boolean;
  onClose: () => void;
  onConfirmed: (booking: Booking) => void;
  onExecuted?: (op: LastOperation) => void;
}

export function ConfirmPaymentDialog({ booking, idempotencyKey, open, onClose, onConfirmed, onExecuted }: Props) {
  const confirm = useConfirmBooking();
  const [externalPaymentId, setExternalPaymentId] = useState(newExternalPaymentId);
  const [wrongAmount, setWrongAmount] = useState(false);
  useEffect(() => {
    if (open) setExternalPaymentId(newExternalPaymentId());
  }, [open]);
  const amount = wrongAmount ? round2(booking.pricing.amountDue - 1) : booking.pricing.amountDue;
  const payment: PaymentInput = { externalPaymentId, amount, currency: 'USD' };

  const submit = async () => {
    onExecuted?.({ label: `POST /bookings/${booking.id}/confirm`, run: () => confirmBooking(booking.id, payment, idempotencyKey) });
    try {
      const confirmed = await confirm.mutateAsync({ id: booking.id, payment, idempotencyKey });
      toast.success(`Reserva ${confirmed.confirmationCode} confirmada`);
      onConfirmed(confirmed);
      onClose();
    } catch (err) {
      notifyError(err);
    }
  };

  return (
    <Modal open={open} title="Cobrar al cliente (simulado)" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        El canal cobra a su cliente por su cuenta y luego confirma con la referencia de ese cobro. Confirmar <strong>no</strong> le cobra nada a Carvi: lo que se le debe se liquida por periodos.
      </p>
      <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm">
        <div>Cobro ficticio al cliente: <strong>{money(booking.pricing.total)}</strong> por la renta.</div>
        <div>Se envía a Carvi <code>payment.amount = {money(amount)}</code> (debe ser exactamente <code>amountDue = {money(booking.pricing.amountDue)}</code>).</div>
      </div>
      <Field label="externalPaymentId · referencia de tu cobro" hint="Repetir la confirmación con el mismo id es seguro; otro id sobre una reserva pagada responde 409.">
        <Input value={externalPaymentId} onChange={(e) => setExternalPaymentId(e.target.value)} maxLength={128} />
      </Field>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={wrongAmount} onChange={(e) => setWrongAmount(e.target.checked)} />
        Enviar importe incorrecto (resta 1.00) para ver el <code>400 VALIDATION_ERROR</code> con <code>details.expected/received</code>
      </label>
      <p className="mt-3 text-xs text-slate-500">Idempotency-Key: <code>{idempotencyKey}</code></p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button onClick={submit} disabled={confirm.isPending || !externalPaymentId}>Confirmar reserva</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Write `CancelBookingDialog.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { useCancelBooking } from '../../api/hooks';
import { cancelBooking } from '../../api/requests';
import type { Booking, CancelResult } from '../../api/types';
import { money } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { Button, Field, Input, Modal } from '../ui';
import type { LastOperation } from './types';

interface Props {
  booking: Booking;
  idempotencyKey: string;
  open: boolean;
  onClose: () => void;
  onCancelled: (result: CancelResult) => void;
  onExecuted?: (op: LastOperation) => void;
}

export function CancelBookingDialog({ booking, idempotencyKey, open, onClose, onCancelled, onExecuted }: Props) {
  const cancel = useCancelBooking();
  const [reason, setReason] = useState('');
  const submit = async () => {
    const trimmed = reason.trim() || undefined;
    onExecuted?.({ label: `POST /bookings/${booking.id}/cancel`, run: () => cancelBooking(booking.id, trimmed, idempotencyKey) });
    try {
      const result = await cancel.mutateAsync({ id: booking.id, reason: trimmed, idempotencyKey });
      toast.success(`Cancelada · reembolsable a tu cliente: ${money(result.cancellation.refundableAmount)} (${result.cancellation.policy})`);
      onCancelled(result);
      onClose();
    } catch (err) {
      notifyError(err);
    }
  };
  return (
    <Modal open={open} title={`Cancelar ${booking.confirmationCode}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">
        Política <code>FULL_UNTIL_24H_BEFORE_START</code>: 100 % de <code>amountDue</code> reembolsable hasta 24 h antes del inicio, 0 % después; un HOLD cancela con 0. Carvi no mueve dinero del canal: la respuesta trae <code>cancellation.refundableAmount</code> para que reembolses a tu cliente.
      </p>
      <Field label="Motivo (opcional, máx. 500)"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
      <p className="mt-3 text-xs text-slate-500">Idempotency-Key: <code>{idempotencyKey}</code></p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        <Button variant="danger" onClick={submit} disabled={cancel.isPending}>Cancelar reserva</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Write `StepCustomer.tsx`**

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateBooking } from '../../api/hooks';
import { createBooking } from '../../api/requests';
import { PLACES, type Booking, type BookingInput, type Quote } from '../../api/types';
import type { LastOperation } from '../../components/booking/types';
import { Button, Card, Field, Input, Select } from '../../components/ui';
import { notifyError } from '../../lib/notify';
import { guidanceFor } from './guidance';

const schema = z.object({
  fullName: z.string().trim().min(3, 'Nombre completo'),
  email: z.string().trim().email('Correo inválido'),
  phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Formato internacional, p. ej. +50370001234'),
  country: z.string().trim().length(2, 'ISO-3166 alpha-2, p. ej. SV'),
  externalReference: z.string().trim().max(64, 'Máximo 64 caracteres'),
  pickup: z.string().min(1),
  dropoff: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  quote: Quote;
  idempotencyKey: string;
  onBack: () => void;
  onBooked: (booking: Booking) => void;
  onExecuted: (op: LastOperation) => void;
}

const COUNTRIES = ['SV', 'GT', 'HN', 'NI', 'CR', 'PA', 'MX', 'US'];

export function StepCustomer({ quote, idempotencyKey, onBack, onBooked, onExecuted }: Props) {
  const create = useCreateBooking();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: 'Ana Demo', email: 'ana.demo@example.com', phone: '+50370001234', country: 'SV', externalReference: `DEMO-${Date.now().toString(36).toUpperCase()}`, pickup: 'AIRPORT', dropoff: 'AIRPORT' },
  });
  const error = create.error;
  const submit = form.handleSubmit(async (values) => {
    const input: BookingInput = {
      quoteId: quote.quoteId,
      externalReference: values.externalReference || undefined,
      customer: { fullName: values.fullName, email: values.email, phone: values.phone, country: values.country.toUpperCase() },
      pickup: { location: values.pickup },
      dropoff: { location: values.dropoff },
    };
    onExecuted({ label: 'POST /bookings', run: () => createBooking(input, idempotencyKey) });
    try {
      onBooked(await create.mutateAsync({ input, idempotencyKey }));
    } catch (err) {
      notifyError(err);
    }
  });
  const err = (name: keyof FormValues) => form.formState.errors[name]?.message;
  return (
    <Card className="max-w-2xl">
      <p className="mb-4 text-sm text-slate-600"><code>POST /bookings</code> con la cabecera <code>Idempotency-Key</code> crea la reserva en <strong>HOLD</strong> durante 15 minutos. La cotización no se consume.</p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre completo" error={err('fullName')}><Input {...form.register('fullName')} /></Field>
        <Field label="Correo" error={err('email')}><Input type="email" {...form.register('email')} /></Field>
        <Field label="Teléfono (internacional)" error={err('phone')}><Input {...form.register('phone')} /></Field>
        <Field label="País (alpha-2)" error={err('country')}>
          <Input list="countries" maxLength={2} {...form.register('country')} />
          <datalist id="countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Lugar de entrega" error={err('pickup')}>
          <Select {...form.register('pickup')}>{PLACES.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}</Select>
        </Field>
        <Field label="Lugar de devolución" error={err('dropoff')}>
          <Select {...form.register('dropoff')}>{PLACES.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}</Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="externalReference (opcional, tu propio identificador)" error={err('externalReference')}><Input {...form.register('externalReference')} /></Field>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">
            <div>{error.code} · {error.message}</div>
            {guidanceFor(error.code) && <div className="mt-1">{guidanceFor(error.code)}</div>}
            {error.code === 'CLIENT_DATA_CONFLICT' && <div className="mt-1">Campo: <code>{String((error.details as { field?: string } | null)?.field ?? '')}</code></div>}
          </div>
        )}
        <p className="text-xs text-slate-500 sm:col-span-2">Idempotency-Key: <code>{idempotencyKey}</code></p>
        <div className="flex justify-between sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onBack}>Volver a la cotización</Button>
          <Button type="submit" disabled={create.isPending}>Crear reserva (HOLD)</Button>
        </div>
      </form>
    </Card>
  );
}
```

- [ ] **Step 6: Write `StepBooking.tsx`**

```tsx
import { useState } from 'react';
import { toast } from 'sonner';
import type { Booking, CancelResult, Quote } from '../../api/types';
import { BookingSummary } from '../../components/booking/BookingSummary';
import { CancelBookingDialog } from '../../components/booking/CancelBookingDialog';
import { ConfirmPaymentDialog } from '../../components/booking/ConfirmPaymentDialog';
import type { LastOperation } from '../../components/booking/types';
import { Badge, Button, Card } from '../../components/ui';
import { mmss, useCountdown } from '../../lib/countdown';
import { money } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { PricingTable } from './PricingTable';
import type { WizardKeys } from './wizardState';

const GRACE_SECONDS = 120;

interface Props {
  booking: Booking;
  quote: Quote;
  keys: WizardKeys;
  lastOp: LastOperation | null;
  onExecuted: (op: LastOperation) => void;
  onBookingUpdated: (booking: Booking) => void;
  onNew: () => void;
  onReuseQuote: () => void;
}

export function StepBooking({ booking, quote, keys, lastOp, onExecuted, onBookingUpdated, onNew, onReuseQuote }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellation, setCancellation] = useState<CancelResult['cancellation'] | null>(null);
  const [repeating, setRepeating] = useState(false);
  const hold = useCountdown(booking.status === 'HOLD' ? booking.hold?.expiresAt : null);
  const quoteCountdown = useCountdown(quote.expiresAt);
  const inGrace = hold.expired && hold.secondsSinceExpiry <= GRACE_SECONDS;

  const repeat = async () => {
    if (!lastOp) return;
    setRepeating(true);
    try {
      await lastOp.run();
      toast.info(`Reenviada ${lastOp.label} con la misma Idempotency-Key. Mira Idempotent-Replayed en el panel técnico.`);
    } catch (err) {
      notifyError(err);
    } finally {
      setRepeating(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <BookingSummary booking={booking} />
        {booking.status === 'HOLD' && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            {!hold.expired && <Badge tone="amber">Hold vence en {mmss(hold.secondsLeft)}</Badge>}
            {inGrace && <Badge tone="amber">Hold vencido · gracia de 2 min ({mmss(GRACE_SECONDS - hold.secondsSinceExpiry)}) si el vehículo sigue libre</Badge>}
            {hold.expired && !inGrace && <Badge tone="red">Hold vencido · confirmar responderá 410 HOLD_EXPIRED</Badge>}
          </div>
        )}
        {cancellation && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            Cancelada ({cancellation.reason}). Reembolsable a tu cliente: <strong>{money(cancellation.refundableAmount)} {cancellation.currency}</strong> · política {cancellation.policy}. Carvi no mueve ese dinero.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {booking.status === 'HOLD' && <Button onClick={() => setConfirmOpen(true)}>Cobrar al cliente (simulado) y confirmar</Button>}
          {(booking.status === 'HOLD' || booking.status === 'CONFIRMED') && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancelar</Button>}
          {lastOp && <Button variant="secondary" onClick={repeat} disabled={repeating}>Repetir la última petición ({lastOp.label})</Button>}
          <Button variant="secondary" onClick={onNew}>Nueva reserva</Button>
          {!quoteCountdown.expired && <Button variant="ghost" onClick={onReuseQuote}>Reservar otra vez con la misma cotización</Button>}
        </div>
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Cotización usada</h3>
        <PricingTable pricing={booking.pricing} />
        <p className="mt-3 text-xs text-slate-500">quoteId {quote.quoteId} · {quoteCountdown.expired ? 'vencida' : `vence en ${mmss(quoteCountdown.secondsLeft)}`}</p>
      </Card>
      <ConfirmPaymentDialog booking={booking} idempotencyKey={keys.confirm} open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirmed={onBookingUpdated} onExecuted={onExecuted} />
      <CancelBookingDialog
        booking={booking}
        idempotencyKey={keys.cancel}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(result) => {
          setCancellation(result.cancellation);
          onBookingUpdated(result.booking);
        }}
        onExecuted={onExecuted}
      />
    </div>
  );
}
```

- [ ] **Step 7: Finish `BookingWizardPage.tsx`**

Replace the `state.step >= 4` placeholder with:
```tsx
      {state.step === 4 && state.quote && (
        <StepCustomer
          quote={state.quote}
          idempotencyKey={state.keys.booking}
          onBack={() => dispatch({ type: 'GO_TO', step: 3 })}
          onBooked={(booking) => dispatch({ type: 'SET_BOOKING', booking })}
          onExecuted={setLastOp}
        />
      )}
      {state.step === 5 && state.booking && state.quote && (
        <StepBooking
          booking={state.booking}
          quote={state.quote}
          keys={state.keys}
          lastOp={lastOp}
          onExecuted={setLastOp}
          onBookingUpdated={(booking) => dispatch({ type: 'SET_BOOKING', booking })}
          onNew={() => { setLastOp(null); dispatch({ type: 'RESET' }); }}
          onReuseQuote={() => { setLastOp(null); dispatch({ type: 'REUSE_QUOTE' }); }}
        />
      )}
```
and add `const [lastOp, setLastOp] = useState<LastOperation | null>(null);` with imports `useState`, `LastOperation`, `StepCustomer`, `StepBooking`.

- [ ] **Step 8: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build && npm test`. Browser, full run: step 4 defaults → "Crear reserva" → step 5 shows `CV-…`, HOLD countdown → "Repetir la última petición" → panel shows a second `POST /bookings` with `idempotent-replayed: true` → "Cobrar…" with the wrong-amount box → `VALIDATION_ERROR` with `expected/received` → uncheck, confirm → CONFIRMED with `payment.status PENDING_SETTLEMENT` → "Cancelar" → refundable amount shown. "Reservar otra vez con la misma cotización" returns to step 4 with a new Idempotency-Key.
```bash
git add src
git commit -m "feat(web): booking creation, hold, simulated payment and cancellation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Reservas page with detail and actions

**Files:**
- Create: `src/pages/BookingsPage.tsx`, `src/components/booking/BookingDetailDrawer.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `useBookings`, `useBooking`, `BookingSummary`, `ConfirmPaymentDialog`, `CancelBookingDialog`, `StatusBadge`, `Pagination`, `BOOKING_STATUSES`.

- [ ] **Step 1: Write `BookingDetailDrawer.tsx`**

```tsx
import { X } from 'lucide-react';
import { useState } from 'react';
import { CarviApiError } from '../../api/client';
import { useBooking } from '../../api/hooks';
import { newIdempotencyKey } from '../../lib/idempotency';
import { Button, JsonBlock, Spinner } from '../ui';
import { BookingSummary } from './BookingSummary';
import { CancelBookingDialog } from './CancelBookingDialog';
import { ConfirmPaymentDialog } from './ConfirmPaymentDialog';

export function BookingDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const booking = useBooking(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // A new logical operation each time a dialog is opened.
  const [confirmKey, setConfirmKey] = useState(newIdempotencyKey);
  const [cancelKey, setCancelKey] = useState(newIdempotencyKey);
  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[560px] max-w-full flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="font-semibold">GET /bookings/{id}</div>
        <Button variant="ghost" onClick={onClose} aria-label="Cerrar"><X size={16} /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {booking.isPending && <Spinner />}
        {booking.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {booking.error instanceof CarviApiError ? `${booking.error.code} · ${booking.error.message}` : String(booking.error)}
          </div>
        )}
        {booking.data && (
          <>
            <BookingSummary booking={booking.data} />
            <div className="flex flex-wrap gap-2">
              {booking.data.status === 'HOLD' && <Button onClick={() => { setConfirmKey(newIdempotencyKey()); setConfirmOpen(true); }}>Confirmar (pago simulado)</Button>}
              {(booking.data.status === 'HOLD' || booking.data.status === 'CONFIRMED') && (
                <Button variant="danger" onClick={() => { setCancelKey(newIdempotencyKey()); setCancelOpen(true); }}>Cancelar</Button>
              )}
              <Button variant="secondary" onClick={() => booking.refetch()}>Recargar</Button>
            </div>
            <JsonBlock value={booking.data} />
            <ConfirmPaymentDialog booking={booking.data} idempotencyKey={confirmKey} open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirmed={() => undefined} />
            <CancelBookingDialog booking={booking.data} idempotencyKey={cancelKey} open={cancelOpen} onClose={() => setCancelOpen(false)} onCancelled={() => undefined} />
          </>
        )}
      </div>
    </aside>
  );
}
```
(`useConfirmBooking`/`useCancelBooking` already write the fresh booking into the `['booking', id]` cache, so the drawer updates on its own.)

- [ ] **Step 2: Write `BookingsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useBookings } from '../api/hooks';
import { BOOKING_STATUSES, type BookingStatus } from '../api/types';
import { BookingDetailDrawer } from '../components/booking/BookingDetailDrawer';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { Badge, Button, EmptyState, Field, Input, PageTitle, Select, Spinner } from '../components/ui';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { money } from '../lib/format';
import { notifyError } from '../lib/notify';

export function BookingsPage() {
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const bookings = useBookings({ page, limit: 20, status: status || undefined, from: from || undefined, to: to || undefined });
  useEffect(() => {
    if (bookings.error) notifyError(bookings.error);
  }, [bookings.error]);
  return (
    <>
      <PageTitle title="Reservas" subtitle="GET /bookings · solo las reservas creadas con la credencial del token, de la más reciente a la más antigua." />
      <div className="mb-4 grid max-w-3xl grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
        <Field label="Estado">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as BookingStatus | ''); setPage(1); }}>
            <option value="">Todos</option>
            {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
        <Button variant="secondary" onClick={() => { setStatus(''); setFrom(''); setTo(''); setPage(1); }}>Limpiar</Button>
      </div>
      {bookings.isPending && <Spinner />}
      {bookings.data && bookings.data.data.length === 0 && <EmptyState>No hay reservas con esos filtros.</EmptyState>}
      {bookings.data && bookings.data.data.length > 0 && (
        <>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-2">Código</th><th>Estado</th><th>Vehículo</th><th>Cliente</th><th>Periodo</th><th className="text-right">amountDue</th><th>Pago</th><th>Creada</th></tr>
            </thead>
            <tbody>
              {bookings.data.data.map((b) => (
                <tr key={b.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setSelected(b.id)}>
                  <td className="py-2 font-mono">{b.confirmationCode}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>{b.vehicle.brand} {b.vehicle.model}</td>
                  <td>{b.customer.fullName}</td>
                  <td>{fmtDate(b.period.from)} → {fmtDate(b.period.to)}</td>
                  <td className="text-right">{money(b.pricing.amountDue)}</td>
                  <td>{b.payment ? <Badge tone="blue">{b.payment.status}</Badge> : <span className="text-slate-400">—</span>}</td>
                  <td className="text-slate-500">{fmtDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={bookings.data.meta} onPage={setPage} />
        </>
      )}
      {selected && <BookingDetailDrawer id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
```

Register `{ path: '/reservas', element: <BookingsPage /> }` in `src/router.tsx`.

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build`. Browser: list shows the bookings from Task 11; filter by `CONFIRMED`; open a HOLD row, confirm from the drawer, the badge updates; cancel from the drawer; the raw JSON block shows `payment` and `cancellation`.
```bash
git add src
git commit -m "feat(web): bookings list with detail drawer and actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Webhooks page

**Files:**
- Create: `src/pages/WebhooksPage.tsx`
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `local`, `useEventSource`, `useServerConfig`, `ReceivedEvent` shape from Task 6 (mirrored locally).

- [ ] **Step 1: Write `WebhooksPage.tsx`**

```tsx
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { local } from '../api/client';
import { useServerConfig } from '../api/hooks';
import { Badge, Card, EmptyState, JsonBlock, PageTitle, Select, cn, type Tone } from '../components/ui';
import { fmtDateTime } from '../lib/dates';
import { useEventSource } from '../lib/sse';

interface ReceivedEvent {
  id: string;
  receivedAt: string;
  type: string;
  eventId: string;
  keyId: string;
  timestamp: string;
  signatureStatus: 'VALID' | 'INVALID' | 'UNVERIFIED';
  reason?: string;
  duplicate: boolean;
  payload: unknown;
  headers: Record<string, string>;
}

const EVENT_TYPES = ['booking.confirmed', 'booking.cancelled', 'booking.expired', 'booking.started', 'booking.completed', 'vehicle.unpublished', 'settlement.status_changed'];
const signatureTone: Record<ReceivedEvent['signatureStatus'], Tone> = { VALID: 'green', INVALID: 'red', UNVERIFIED: 'amber' };

function EventRow({ event }: { event: ReceivedEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="p-0">
      <button className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-slate-500">{fmtDateTime(event.receivedAt)}</span>
        <Badge tone="blue">{event.type}</Badge>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{event.eventId || '(sin eventId)'}</span>
        <span className="font-mono text-xs text-slate-500">{event.keyId}</span>
        {event.duplicate && <Badge tone="neutral">duplicado</Badge>}
        <Badge tone={signatureTone[event.signatureStatus]}>firma {event.signatureStatus}{event.reason ? ` · ${event.reason}` : ''}</Badge>
      </button>
      {expanded && (
        <div className={cn('grid gap-3 border-t border-slate-100 p-3 text-xs', 'md:grid-cols-2')}>
          <div><div className="mb-1 font-semibold text-slate-600">Cabeceras</div><JsonBlock value={event.headers} className="max-h-60" /></div>
          <div><div className="mb-1 font-semibold text-slate-600">Sobre</div><JsonBlock value={event.payload} className="max-h-96" /></div>
        </div>
      )}
    </Card>
  );
}

export function WebhooksPage() {
  const [events, setEvents] = useState<ReceivedEvent[]>([]);
  const [type, setType] = useState('');
  const config = useServerConfig();
  useEffect(() => {
    local.get<ReceivedEvent[]>('/events').then((res) => setEvents(res.data)).catch(() => undefined);
  }, []);
  const { connected } = useEventSource<ReceivedEvent>('/api/events/stream', (event) => setEvents((prev) => [event, ...prev].slice(0, 200)));
  const visible = useMemo(() => (type ? events.filter((e) => e.type === type) : events), [events, type]);
  return (
    <>
      <PageTitle
        title="Webhooks"
        subtitle="Carvi envía POST firmados a tu webhookUrl. El servidor del demo verifica HMAC-SHA256 sobre «timestamp.cuerpo», acepta firma doble en rotación y deduplica por eventId."
        actions={<span className="flex items-center gap-2 text-sm text-slate-500"><span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} />{connected ? 'escuchando' : 'reconectando'}</span>}
      />
      <Card className="mb-4 text-sm">
        <div>URL a configurar en el portal: <code className="font-mono">{config.data?.webhookUrl ?? '…'}</code></div>
        <div className="mt-1 text-slate-500">Responde 2xx en menos de 5 s · sin garantía de orden (resuelve por occurredAt y data.status) · reintentos con retroceso hasta 8 veces · eventId estable: deduplica por él.</div>
      </Card>
      <div className="mb-3 max-w-xs">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>
      {visible.length === 0 && <EmptyState>Todavía no ha llegado ningún evento. Confirma o cancela una reserva y aparecerá aquí en cuanto Carvi lo entregue.</EmptyState>}
      <div className="space-y-2">{visible.map((event) => <EventRow key={event.id} event={event} />)}</div>
    </>
  );
}
```

Register `{ path: '/webhooks', element: <WebhooksPage /> }` in `src/router.tsx` and delete the `Soon` placeholder component.

- [ ] **Step 2: Verify and commit**

Run: `npm run lint && npm run typecheck && npm run build`. Browser: `node scripts/send-test-webhook.mjs <secret>` → the row appears live with `firma VALID`; send it again with a wrong secret → `INVALID · MISMATCH`; with the real backend, confirming a reserva delivers `booking.confirmed` (the credential's `webhookUrl` must point to `http://localhost:4020/webhooks/carvi` and `CARVI_WEBHOOK_SECRETS` must hold its secret).
```bash
git add src
git commit -m "feat(web): live webhook feed with signature status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: README and end-to-end manual verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Demo de socio · API de integración de Carvi

Aplicación de demostración que simula a un **socio de distribución** consumiendo la API de máquina de
Carvi (`/integrations/v1`) de punta a punta: token, salud, catálogo, disponibilidad, cotización,
reserva en hold, confirmación con el pago del canal, cancelación y recepción de webhooks firmados.

No es producto: todo el estado del servidor vive en memoria y se pierde al reiniciarlo.

## Cómo funciona

- `server/` (Express, puerto **4020**) guarda el `client_secret`, pide y cachea el token, reenvía
  `/api/carvi/*` a Carvi con `Authorization`, `X-Request-Id` e `Idempotency-Key`, registra cada
  intercambio HTTP y recibe los webhooks en `POST /webhooks/carvi` verificando la firma HMAC.
- `src/` (Vite + React, puerto **5176**) solo habla con el servidor local. Pantallas: Estado,
  Catálogo, Reservar (asistente de 5 pasos), Reservas y Webhooks, más un panel técnico con las
  peticiones y respuestas crudas.

## Puesta en marcha

1. Crea una credencial desde el portal de integraciones con los scopes `catalog:read` y
   `booking:write`, `webhookUrl = http://localhost:4020/webhooks/carvi` y un secreto de webhook.
   Copia el `client_secret` y el secreto de webhook: se muestran una sola vez.
2. Arranca el backend de Carvi en local (`PORT=3999`) o apunta a un despliegue.
3. Configura el demo:

   ```bash
   cp .env.example .env   # y rellena CARVI_CLIENT_ID, CARVI_CLIENT_SECRET y CARVI_WEBHOOK_SECRETS
   npm install
   npm run dev            # web en http://localhost:5176, servidor en :4020
   ```

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `CARVI_API_BASE_URL` | URL base de la API de socios, con `/integrations/v1` | `http://localhost:3999/integrations/v1` |
| `CARVI_CLIENT_ID` | `client_id` de la credencial | obligatoria |
| `CARVI_CLIENT_SECRET` | `client_secret` de la credencial | obligatoria |
| `CARVI_WEBHOOK_SECRETS` | Secretos de webhook separados por coma (dos durante una rotación) | vacío: entregas «sin verificar» |
| `PORT` | Puerto del servidor local | `4020` |
| `PUBLIC_WEBHOOK_URL` | URL pública a configurar como `webhookUrl` en el portal | `http://localhost:4020/webhooks/carvi` |

Contra un backend desplegado, Carvi no puede llegar a `localhost`: publica el puerto 4020 con un
túnel (por ejemplo `ngrok http 4020`) y pon esa URL en `PUBLIC_WEBHOOK_URL` y en el portal.

## Recorrido sugerido

1. **Estado**: entorno, scopes y configuración; abre el panel técnico y mira el `POST /auth/token`.
2. **Catálogo**: vehículos y ficha (`Cache-Control: private, max-age=900`).
3. **Reservar**: periodo (mínimo 5 días de calendario) → disponibilidad → cotización con cuenta
   atrás → cliente y lugares → reserva en HOLD. Prueba «Repetir la última petición» y busca
   `idempotent-replayed: true` en el panel; marca «Enviar importe incorrecto» para ver el
   `VALIDATION_ERROR`; confirma y cancela.
4. **Reservas**: lista con filtros, detalle y las mismas acciones.
5. **Webhooks**: cada confirmación o cancelación llega firmada. Sin backend, prueba con
   `node scripts/send-test-webhook.mjs <secreto>`.

## Verificación

```bash
npm run lint && npm run typecheck && npm run build && npm test
```

Las pruebas (vitest) cubren la lógica pura del servidor: firma de webhooks, caché del token,
configuración, proxy y registro de intercambios; y la regla de días de calendario del front.
```

- [ ] **Step 2: Full manual run (record the outcome in the commit body if anything deviates)**

With backend on `:3999`, `.env` filled, `npm run dev`:
1. Estado: `environment: sandbox`, scopes listed, panel shows token request masked.
2. Catálogo → detail → "Reservar este vehículo" preselects in step 2.
3. Wizard end to end: HOLD → repeat (replayed) → wrong amount (400) → confirm (CONFIRMED, `PENDING_SETTLEMENT`) → Webhooks shows `booking.confirmed` with `firma VALID` → cancel from Reservas drawer → `booking.cancelled` arrives with `refund.responsibility: PARTNER`.
4. Stop the backend, press "Comprobar de nuevo": `UPSTREAM_UNREACHABLE` message and the panel opens.

- [ ] **Step 3: Final checks and commit**

Run: `npm run lint && npm run typecheck && npm run build && npm test` → all green.
```bash
git add README.md
git commit -m "docs: README with setup, env vars and suggested walkthrough

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
