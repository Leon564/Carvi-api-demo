# Demo de socio · consumo de la API de integración de Carvi

**Fecha:** 2026-09-23 · **Repo:** `E:\Dev\carvi\demo-socio` · **Estado:** aprobado en conversación

## 1. Propósito

Aplicación de demostración que simula a un **socio de distribución** (como Weris) consumiendo la
API de máquina de Carvi (`/integrations/v1`) de punta a punta, con una interfaz sencilla que cuenta
el flujo paso a paso y enseña, al mismo tiempo, el contrato HTTP crudo. Sirve para mostrar la
integración a un socio o al equipo; no es producto.

Cubre **todas** las rutas de `/integrations/v1`: `POST /auth/token`, `GET /health`, `GET /vehicles`,
`GET /vehicles/{id}`, `GET /availability`, `POST /quotes`, `POST /bookings`, `GET /bookings`,
`GET /bookings/{id}`, `POST /bookings/{id}/confirm`, `POST /bookings/{id}/cancel` y la recepción de
webhooks firmados.

**Fuera de alcance:** las rutas del portal (`/integrations-portal`: credenciales, liquidaciones,
entregas), forzar el vencimiento de un hold (ruta admin), despliegue y diseño visual elaborado.

Fuentes de verdad del contrato: `backend/src/integrations/portal/docs/guia-integracion.md` y el
OpenAPI servido por el backend (`GET /integrations-portal/docs/openapi.yaml`).

## 2. Decisiones

| Decisión | Elección | Motivo |
|---|---|---|
| Dónde vive el `client_secret` | En un servidor Node mínimo dentro del mismo repo | Refleja a un socio real, evita exponer el secreto en el navegador, permite recibir webhooks y no exige tocar `CORS_ORIGINS` del backend |
| Forma de la interfaz | Recorrido guiado (asistente de reserva) + páginas de consulta + panel técnico | El asistente explica el orden y las reglas (hold, gracia, idempotencia); el panel técnico da la vista cruda sin duplicar formularios |
| Stack del front | Vite 5 + React 18 + TypeScript + Tailwind 3.4, TanStack Query 5, react-router 7 | Mismo stack que los fronts hermanos (`integraciones`, `backoffice`) |
| Stack del servidor | Express 4 en TypeScript ejecutado con `tsx` | Mínimo, sin build aparte |
| Idiomas | Código, comentarios y commits en inglés; textos de la UI y documentación en español | Convención del equipo |
| Pruebas | Lint + `tsc` + build como los hermanos; vitest solo para la lógica pura del servidor | Coste proporcional a un demo |

## 3. Arquitectura

```
navegador (React, :5176)
   │  /api/*  y  /webhooks/*  (proxy de Vite en desarrollo)
   ▼
servidor Node (Express, :4020)
   ├─ token manager ── POST /auth/token ──────────────┐
   ├─ /api/carvi/*  ── proxy con Bearer + X-Request-Id ─┤──► Carvi /integrations/v1 (:3999 local)
   ├─ /api/log, /api/log/stream (SSE)                   │
   ├─ /api/events, /api/events/stream (SSE)             │
   ├─ /api/config                                       │
   └─ /webhooks/carvi ◄── entregas firmadas ────────────┘
```

Todo el estado del servidor (token, registro de intercambios, eventos recibidos) vive **en
memoria**: reiniciar el servidor lo limpia. Es deliberado para un demo.

### 3.1 Estructura del repo

```
demo-socio/
  package.json            # un solo paquete; scripts dev/build/lint/typecheck/test
  .env.example            # variables del servidor (ver 3.2)
  vite.config.ts          # proxy /api y /webhooks → http://localhost:4020
  server/
    index.ts              # arranque de Express
    config.ts             # lectura y validación de .env
    token-manager.ts      # caché y renovación del token
    carvi-client.ts       # llamada genérica a Carvi (fetch nativo) con cabeceras
    proxy.ts              # rutas /api/carvi/*
    exchange-log.ts       # registro en memoria + SSE de intercambios HTTP
    webhooks.ts           # receptor /webhooks/carvi, verificación HMAC, SSE de eventos
    signature.ts          # verifySignature(secret[], timestamp, rawBody, header) (puro)
    sse.ts                # utilidad de canales SSE
    *.test.ts             # vitest: signature, token-manager
  src/
    main.tsx, App.tsx, router.tsx
    api/                  # cliente axios hacia /api, tipos del contrato, hooks de TanStack Query
    lib/                  # utilidades: fechas, dinero, cuenta atrás, uuid
    components/           # Layout, panel técnico, tarjetas, badges de estado, formularios
    pages/                # Estado, Catalogo, Reservar (asistente), Reservas, Webhooks
  docs/superpowers/specs/ # este documento
```

### 3.2 Variables de entorno del servidor

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `CARVI_API_BASE_URL` | URL base de la API de socios, incluyendo `/integrations/v1` | `http://localhost:3999/integrations/v1` |
| `CARVI_CLIENT_ID` | `client_id` de una credencial creada en el portal | obligatoria |
| `CARVI_CLIENT_SECRET` | `client_secret` de esa credencial | obligatoria |
| `CARVI_WEBHOOK_SECRETS` | Secretos de webhook separados por coma (dos durante una rotación) | vacío → toda entrega se marca como «sin verificar» |
| `PORT` | Puerto del servidor | `4020` |
| `PUBLIC_WEBHOOK_URL` | URL pública que hay que configurar en el portal como `webhookUrl` | `http://localhost:4020/webhooks/carvi` |

El servidor falla al arrancar si faltan `CARVI_CLIENT_ID` o `CARVI_CLIENT_SECRET`, enumerando las
variables que faltan. El `.env` no se versiona.

## 4. Servidor

### 4.1 Gestor de token (`token-manager.ts`)

- `getToken()`: devuelve el token cacheado si le quedan más de 60 s; si no, pide uno nuevo con
  `POST /auth/token` y cuerpo `{ grant_type: "client_credentials", client_id, client_secret }`.
- Una sola petición de renovación en vuelo: llamadas concurrentes esperan la misma promesa.
- `invalidate()`: descarta el token cacheado (lo usa el proxy tras un `401 INVALID_TOKEN`).
- La petición de token también entra en el registro de intercambios (con el secreto ofuscado).
- Interfaz inyectable (`fetch` y reloj) para poder probarlo con vitest.

### 4.2 Proxy (`proxy.ts`)

`ALL /api/carvi/*` → `${CARVI_API_BASE_URL}/*` conservando método, query y cuerpo JSON.

Cabeceras que añade: `Authorization: Bearer <token>`, `X-Request-Id` (UUID v4 nuevo por petición),
`Content-Type: application/json` cuando hay cuerpo. Cabeceras que reenvía si vienen del front:
`Idempotency-Key`.

Respuesta al front: mismo status y mismo cuerpo que devolvió Carvi (sin sobre adicional), más las
cabeceras `X-Request-Id`, `Idempotent-Replayed`, `Retry-After` y `Cache-Control` cuando existan.

Ante `401` con `error.code === "INVALID_TOKEN"` invalida el token y reintenta **una** vez. Un error
de red hacia Carvi responde `502` con el sobre `{ error: { code: "UPSTREAM_UNREACHABLE", message,
details: null, requestId } }` para que el front lo trate igual que el catálogo.

### 4.3 Registro de intercambios (`exchange-log.ts`)

Cada petición al proxy (y cada petición de token) se guarda como:

```ts
{ id, at, method, path, query, requestHeaders, requestBody, status, responseHeaders, responseBody, durationMs }
```

`requestHeaders` lleva `Authorization` y `client_secret` ofuscados (`Bearer ****`). Se conservan los
últimos 200. `GET /api/log` devuelve la lista; `GET /api/log/stream` es un canal SSE que emite cada
intercambio nuevo. El front usa ambos para el panel técnico.

### 4.4 Receptor de webhooks (`webhooks.ts`, `signature.ts`)

`POST /webhooks/carvi` con el cuerpo **crudo** (`express.raw`).

1. Lee `X-Carvi-Timestamp`, `X-Carvi-Signature`, `X-Carvi-Event`, `X-Carvi-Event-Id`,
   `X-Carvi-Key-Id`, `X-Request-Id`.
2. `verifySignature(secrets, timestamp, rawBody, signatureHeader, now)` (función pura):
   - separa el valor de la cabecera por comas y quita el prefijo `sha256=`;
   - calcula `HMAC-SHA256(secret, "<timestamp>.<rawBody>")` en hex para cada secreto;
   - válida si **alguna** firma coincide con **algún** secreto (comparación en tiempo constante);
   - devuelve `{ valid: boolean, reason?: "NO_SECRETS" | "NO_SIGNATURE" | "MISMATCH" | "STALE" }`;
     `STALE` cuando el timestamp difiere más de 300 s del reloj.
3. Parsea el JSON. Deduplica por `eventId`: un `eventId` ya visto se marca `duplicate: true` y no
   se vuelve a emitir, pero responde igual.
4. Responde `200 { received: true }` si la firma es válida; `401 { error: "INVALID_SIGNATURE" }` si
   no. Sin secretos configurados (`NO_SECRETS`) responde `200` y marca el evento como
   `signatureStatus: "UNVERIFIED"` para que el demo funcione aunque no se haya copiado el secreto.
5. Guarda `{ id, receivedAt, type, eventId, keyId, timestamp, signatureStatus: "VALID" | "INVALID"
   | "UNVERIFIED", reason, duplicate, payload, headers }` (últimos 200) y lo emite por SSE.

`GET /api/events` devuelve la lista; `GET /api/events/stream` es el canal SSE.

### 4.5 Configuración (`/api/config`)

`GET /api/config` → `{ apiBaseUrl, clientId, webhookUrl, webhookSecretsConfigured: number }`. Nunca
devuelve secretos.

## 5. Front

### 5.1 Base

- `src/api/client.ts`: axios con `baseURL: "/api/carvi"`; interceptor de respuesta que convierte el
  sobre de error de Carvi en un `CarviApiError { status, code, message, details, requestId }`.
- `src/api/types.ts`: tipos del contrato (`Vehicle`, `Availability`, `Quote`, `Booking`,
  `BookingStatus`, `Pricing`, `Period`, `ErrorEnvelope`) transcritos del OpenAPI.
- `src/api/hooks.ts`: hooks de TanStack Query por ruta (`useHealth`, `useVehicles(page, limit)`,
  `useVehicle(id)`, `useAvailability(params)`, `useCreateQuote`, `useCreateBooking`, `useBookings
  (filters)`, `useBooking(id)`, `useConfirmBooking`, `useCancelBooking`).
- `src/lib/idempotency.ts`: `newIdempotencyKey()` (UUID v4). Cada **operación lógica** (crear
  reserva, confirmar, cancelar) genera una clave y la conserva mientras dura la operación en
  pantalla, para poder repetirla y ver `Idempotent-Replayed: true`.
- `src/lib/sse.ts`: hook `useEventSource(url, onMessage)` con reconexión.
- Avisos con `sonner`. Layout con menú lateral (Estado, Catálogo, Reservar, Reservas, Webhooks) y
  un botón que abre el **panel técnico** como cajón lateral derecho en cualquier pantalla.

### 5.2 Pantallas

**Estado** (`/`). Llama a `GET /health` y muestra `environment`, `database`, `time`, `credential.
clientId` y `credential.scopes` como etiquetas. Debajo, la configuración leída de `/api/config`
(URL base, `clientId`, URL de webhook a configurar en el portal y cuántos secretos hay
configurados). Botón «Comprobar de nuevo».

**Catálogo** (`/catalogo`). `GET /vehicles?page&limit` en tarjetas (imagen principal, marca, modelo,
año, tipo, transmisión, plazas, aire, `rateDay`, valoración, anfitrión). Paginación con `meta`.
Clic en una tarjeta → `/catalogo/:id` con la ficha completa de `GET /vehicles/{id}` y galería.
Botón «Reservar este vehículo» que abre el asistente con el vehículo preseleccionado.

**Reservar** (`/reservar`). Asistente de 5 pasos, estado local con `useReducer`:

1. *Periodo.* `from`, `to`, `startTime`, `endTime`. Validación en cliente del mínimo de 5 días de
   calendario (`to − from + 1 ≥ 5`) con el mismo mensaje del backend, para explicar la regla, pero
   sin bloquear: el usuario puede enviar igual y ver el `400 VALIDATION_ERROR` real.
2. *Vehículo.* Lista la página actual de `GET /vehicles` y, para esos ids, `GET /availability`
   (lote de hasta 50). Cada tarjeta muestra `available` o `reason` (`BOOKED`, `BLOCKED`,
   `NOT_FOUND`); las no disponibles no se pueden elegir. Muestra `meta.gapHours` y `timezone`.
3. *Cotización.* `POST /quotes`. Muestra `quoteId`, el desglose de `pricing` (`rateDay`, `totalDays`,
   `totalHours`, `subtotal`, `advance`, `serviceFee`, `amountDue`, `total`) y una cuenta atrás hasta
   `expiresAt`. Al vencer, el botón «Continuar» se sustituye por «Volver a cotizar».
4. *Cliente y lugares.* Formulario (`react-hook-form` + `zod`): `fullName`, `email`, `phone` en
   formato internacional, `country` alpha-2 (select con SV, GT, HN, US y campo libre),
   `externalReference` opcional (≤ 64), `pickup.location` y `dropoff.location` como select con
   `AIRPORT` y `SAN_SALVADOR`. Botón «Crear reserva» → `POST /bookings` con `Idempotency-Key`.
5. *Reserva.* Muestra `confirmationCode`, `status` con badge, cuenta atrás hasta `hold.expiresAt`
   (y después un aviso «gracia de 2 minutos» durante 120 s más), el `pricing` y los datos enviados.
   Acciones:
   - «Cobrar al cliente (simulado)»: genera `externalPaymentId = "demo_pay_" + sufijo`, muestra un
     resumen del cobro ficticio y llama a `POST /bookings/{id}/confirm` con `{ payment: {
     externalPaymentId, amount: pricing.amountDue, currency: "USD" } }` y una `Idempotency-Key`
     propia. Un interruptor «Enviar importe incorrecto» resta 1.00 para provocar el
     `400 VALIDATION_ERROR` con `details.expected/received` (didáctico).
   - «Repetir la última petición»: reenvía la misma operación con la misma clave para enseñar
     `Idempotent-Replayed: true` en el panel técnico.
   - «Cancelar»: pide `reason` opcional y llama a `POST /bookings/{id}/cancel`; muestra
     `cancellation.refundableAmount` y `policy`.
   - «Nueva reserva»: reinicia el asistente (la cotización se puede reutilizar si no venció:
     botón «Reservar otra vez con la misma cotización» que vuelve al paso 4).

   Errores guiados: `VEHICLE_NOT_AVAILABLE` → «Vuelve al paso 2»; `QUOTE_EXPIRED` → «Vuelve a
   cotizar»; `HOLD_EXPIRED` → «El hold venció; reembolsa a tu cliente por tu lado y crea una reserva
   nueva»; `CLIENT_DATA_CONFLICT` → resalta `details.field`; `RATE_LIMITED` → muestra `Retry-After`.

**Reservas** (`/reservas`). `GET /bookings` con filtros `status` (select), `from`, `to`, paginación.
Tabla: `confirmationCode`, estado, vehículo, cliente, periodo, `amountDue`, `payment.status`,
`createdAt`. Fila → cajón de detalle con `GET /bookings/{id}` completo (cliente, lugares, `pricing`,
`hold`, `payment`, `cancellation`) y acciones según estado: en `HOLD` «Confirmar (pago simulado)» y
«Cancelar»; en `CONFIRMED` «Cancelar»; el resto solo lectura. Las acciones reutilizan los mismos
hooks y diálogos del asistente.

**Webhooks** (`/webhooks`). Carga `GET /api/events` y se suscribe a `/api/events/stream`. Lista de
más reciente a más antiguo: hora de recepción, `type` con badge, `eventId`, `keyId`, estado de
firma (`VALID` verde, `INVALID` rojo, `UNVERIFIED` ámbar) y `duplicate`. Fila desplegable con el
sobre completo y las cabeceras. Cabecera de la página con la URL de webhook a configurar y el
recordatorio «responde 2xx en menos de 5 s; sin garantía de orden; deduplica por eventId». Filtro
por `type`.

**Panel técnico** (cajón global). Carga `GET /api/log` y se suscribe a `/api/log/stream`. Cada
intercambio: método, ruta, status con color, duración, y desplegable con cabeceras relevantes de
petición (`Idempotency-Key`, `X-Request-Id`) y respuesta (`X-Request-Id`, `Idempotent-Replayed`,
`Retry-After`, `Cache-Control`) y cuerpos formateados. Los errores muestran el `code` del catálogo
en destacado. Botón «Limpiar» (solo la vista). El panel se abre solo cuando llega un intercambio
con status ≥ 400, para que los errores del contrato se vean sin buscarlos.

### 5.3 Manejo de errores

- Toda respuesta con `error.code` del catálogo se muestra en un aviso con «`CODE` · message» y, si
  hay `details`, un resumen; el `requestId` va en el panel técnico.
- `UPSTREAM_UNREACHABLE` (servidor sin acceso a Carvi) muestra «No hay conexión con la API de Carvi.
  ¿Está el backend arrancado en …?» con la URL de `/api/config`.
- Los SSE reconectan solos; un indicador en el panel técnico y en Webhooks muestra «conectado /
  reconectando».

## 6. Flujo de datos de una reserva (resumen)

```
Reservar/1 periodo → Reservar/2 GET /vehicles + GET /availability → elegir
→ Reservar/3 POST /quotes (quoteId, pricing, expiresAt)
→ Reservar/4 POST /bookings [Idempotency-Key A] → HOLD (hold.expiresAt)
→ Reservar/5 POST /bookings/{id}/confirm [Idempotency-Key B] → CONFIRMED
                                   └─ Carvi → POST /webhooks/carvi booking.confirmed → SSE → Webhooks
→ (opcional) POST /bookings/{id}/cancel [Idempotency-Key C] → CANCELLED (+ webhook booking.cancelled)
```

## 7. Verificación

- `npm run lint`, `npm run typecheck` (`tsc --noEmit` para `src/` y `server/`), `npm run build`.
- `npm test` (vitest): `signature.test.ts` (firma simple, doble firma con secreto viejo y nuevo,
  sin cabecera, sin secretos, desfase de timestamp, cuerpo modificado) y `token-manager.test.ts`
  (primera llamada pide token, segunda reutiliza, renovación cerca del vencimiento, una sola
  renovación con llamadas concurrentes, `invalidate()`).
- Prueba manual documentada en el README: backend local `PORT=3999`, credencial creada desde el
  portal con `webhookUrl = http://localhost:4020/webhooks/carvi`, recorrido completo del asistente,
  cancelación desde Reservas, evento recibido en Webhooks con firma `VALID`, y `Idempotent-Replayed`
  visible en el panel técnico.

## 8. README

Explica el propósito, cómo crear la credencial en el portal, las variables de `.env`, `npm install`
y `npm run dev` (front en `http://localhost:5176`, servidor en `:4020`), y la nota de que contra un
backend desplegado los webhooks necesitan una URL pública (túnel) en `PUBLIC_WEBHOOK_URL`.
