# Demo de socio v2 · flujos simples, webhooks sin secreto y metadata

Fecha: 2026-09-28. Sustituye parcialmente al diseño del 2026-09-23: mismo reparto `server/` + `src/`,
mismos puertos (web 5176, servidor 4020) y mismo panel técnico, pero la app deja de ser un
recorrido «endpoint a endpoint» y pasa a parecer la herramienta interna de un socio (una agencia
que reserva coches para sus clientes). Lo técnico sigue disponible, pero en el panel técnico y en
notas discretas, no en el flujo principal.

## Qué cambia en la API de Carvi (ya en `develop`)

1. **Webhooks sin secreto** (decisión 0017): si la credencial tiene `webhookUrl` pero no tiene
   secreto, Carvi entrega igual, **sin** la cabecera `X-Carvi-Signature` (no viaja vacía).
2. **Token de autorización opcional** (`webhookAuthToken`): si está configurado, cada entrega lleva
   `Authorization: Bearer <token>` tal cual, firmada o no.
3. **`metadata` en `POST /bookings`** (decisión 0018, CADE-33): objeto plano opcional, hasta 50
   claves `^[A-Za-z0-9_.-]{1,40}$`, valores texto (≤ 500), número o booleano; sin anidar, sin
   `null`, ≤ 8 KB. Se fija solo al crear, se devuelve en `Booking.metadata` (`null` si no se envió)
   y en los webhooks de la reserva.

## Servidor (`server/`)

### Configuración

| Variable | Descripción | Por defecto |
| --- | --- | --- |
| `CARVI_API_BASE_URL` | URL base con `/integrations/v1` | `http://localhost:3000/integrations/v1` |
| `CARVI_CLIENT_ID` / `CARVI_CLIENT_SECRET` | credencial | obligatorias |
| `CARVI_WEBHOOK_SECRETS` | secretos separados por coma; vacío = la credencial no tiene secreto | vacío |
| `CARVI_WEBHOOK_AUTH_TOKEN` | token que Carvi debe enviar en `Authorization: Bearer`; vacío = no se exige | vacío |
| `PORT` | puerto del servidor local | `4020` |
| `PUBLIC_WEBHOOK_URL` | URL a configurar como `webhookUrl` | `http://localhost:4020/webhooks/carvi` |

`GET /api/config` →
`{ apiBaseUrl, clientId, webhookUrl, webhookSecretsConfigured: number, webhookAuthTokenConfigured: boolean }`.
Nunca devuelve secretos ni el token.

### Recepción de webhooks (`POST /webhooks/carvi`)

Dos comprobaciones independientes, ambas se registran antes de responder:

**Firma** (`signatureStatus`):

| Secretos configurados | `X-Carvi-Signature` | Resultado | HTTP |
| --- | --- | --- | --- |
| sí | presente y válida (alguna de las firmas con alguno de los secretos, desfase ≤ 5 min) | `VALID` | 200 |
| sí | presente pero no valida / `STALE` | `INVALID` (`reason: MISMATCH` o `STALE`) | 401 `INVALID_SIGNATURE` |
| sí | ausente | `INVALID` (`reason: NO_SIGNATURE`) | 401 `INVALID_SIGNATURE` |
| no | ausente | `UNSIGNED` (así llegan cuando la credencial no tiene secreto) | 200 |
| no | presente | `UNVERIFIED` (`reason: NO_SECRETS`: no hay con qué comprobarla) | 200 |

**Token** (`authStatus`):

| `CARVI_WEBHOOK_AUTH_TOKEN` | `Authorization` | Resultado | HTTP |
| --- | --- | --- | --- |
| vacío | cualquiera | `NOT_REQUIRED` | — |
| definido | `Bearer <token>` igual (comparación en tiempo constante) | `VALID` | — |
| definido | ausente | `MISSING` | 401 `INVALID_AUTH_TOKEN` |
| definido | distinto | `INVALID` | 401 `INVALID_AUTH_TOKEN` |

Si alguna de las dos falla se responde 401 (la firma manda si fallan las dos) y el evento **no**
entra en el conjunto de deduplicación (el reintento válido de Carvi no debe marcarse como
duplicado). Si las dos pasan: `200 { received: true }`.

Evento registrado (memoria, últimos 200, SSE en `/api/events/stream`, lista en `/api/events`):

```ts
interface ReceivedEvent {
  id: string; receivedAt: string; type: string; eventId: string; keyId: string; timestamp: string;
  signatureStatus: 'VALID' | 'INVALID' | 'UNSIGNED' | 'UNVERIFIED';
  reason?: 'NO_SECRETS' | 'NO_SIGNATURE' | 'STALE' | 'MISMATCH';
  authStatus: 'VALID' | 'INVALID' | 'MISSING' | 'NOT_REQUIRED';
  accepted: boolean;          // true si se respondió 200
  duplicate: boolean; payload: unknown; headers: Record<string, string>;
}
```

`headers` incluye `authorization` **ofuscado** (`Bearer ****`) cuando llega, además de las
cabeceras `X-Carvi-*`, `X-Request-Id` y `User-Agent` de antes.

La lógica de decisión vive en una función pura (`evaluateDelivery(config, headers, rawBody, now)`)
con pruebas vitest para cada fila de las dos tablas.

### `scripts/send-test-webhook.mjs`

`node scripts/send-test-webhook.mjs [--unsigned] [--secret <s>] [--token <t>] [--url <u>]`.
Sin `--unsigned` firma con `--secret` (o el primero de `CARVI_WEBHOOK_SECRETS`, o `demo-secret`).
Con `--token` (o `CARVI_WEBHOOK_AUTH_TOKEN`) añade `Authorization: Bearer`. El sobre incluye
`data.booking.metadata` de ejemplo.

## Front (`src/`)

Cinco pantallas, navegación lateral: **Inicio**, **Vehículos**, **Nueva reserva**, **Reservas**,
**Webhooks**. Textos de la interfaz en español. Los nombres de endpoint aparecen solo como nota
discreta (texto pequeño y gris) bajo el título o en el panel técnico; nunca en botones ni títulos.

### Inicio (`/`)

- Tarjeta «Conexión con Carvi»: estado (`GET /health`), entorno (badge sandbox/producción),
  `client_id`, scopes, botón «Comprobar».
- Tarjeta «Webhooks»: URL a configurar, «Firma: con secreto (N)» o «Sin secreto · las entregas
  llegan sin firmar», «Token: configurado» o «no se exige».
- Accesos rápidos: «Nueva reserva», «Ver vehículos».
- «Últimas reservas» (5, `GET /bookings?limit=5`) con código, estado, cliente, importe; clic abre
  el detalle. «Últimos eventos» (5, `/api/events`) con tipo, hora y estado de firma.

### Vehículos (`/vehiculos`, ficha en `/vehiculos/:id`)

Grid como hoy; cada tarjeta tiene botón «Reservar» → `/reservar?vehicleId=<id>`. La ficha conserva
imagen, especificaciones y «Reservar este vehículo».

### Nueva reserva (`/reservar`) · 3 pasos

Estado con `useReducer` (`wizardState.ts`, con pruebas) y una clave de idempotencia por operación
(`booking`, `confirm`, `cancel`) que se conserva mientras dura el intento.

1. **Fechas y vehículo.** Arriba el formulario de fechas (por defecto dentro de 7 días, 5 días de
   calendario, 10:00 → 10:00) con «Buscar»; muestra «N días» y avisa si son menos de 5 (mínimo de
   Carvi) sin bloquear. Debajo, los vehículos de la página con su disponibilidad
   (`GET /availability` sobre los ids visibles): disponibles con «Elegir», el resto atenuados con el
   motivo. «Elegir» pide la cotización (`POST /quotes`) y pasa al paso 2; si falla, el error se
   muestra en la tarjeta con la guía del código (`VALIDATION_ERROR` → ajustar fechas). Con
   `?vehicleId=` el vehículo aparece primero y marcado.
2. **Datos del cliente.** Dos columnas: izquierda el formulario (nombre, correo, teléfono
   internacional, país alpha-2, lugar de entrega y devolución, «Tu referencia» = `externalReference`
   opcional) y un bloque **«Datos adicionales (opcional)»** con filas clave/valor (añadir/quitar,
   máx. 50, clave `^[A-Za-z0-9_.-]{1,40}$`, valor ≤ 500), con la nota «los números y true/false se
   envían con su tipo». Derecha: resumen de la cotización (vehículo, fechas, tabla de precio,
   «cotización válida MM:SS»; si vence, botón «Volver a cotizar» que repite `POST /quotes` con los
   mismos datos). Valores por defecto aleatorios como hoy (evitan choques de correo).
3. **Confirmar.** Resumen completo (vehículo, fechas, cliente, lugares, datos adicionales, precio
   con `amountDue` destacado como «lo que pagas a Carvi») y dos acciones:
   - **«Reservar y pagar»**: `POST /bookings` (HOLD) y a continuación
     `POST /bookings/{id}/confirm` con un pago simulado (`externalPaymentId` `demo_pay_xxxx`,
     `amount = amountDue`, `USD`), con indicador de progreso («Creando reserva…», «Registrando
     pago…»). Si la reserva se crea pero la confirmación falla, se muestra la reserva en HOLD con
     el error y el botón «Reintentar pago» (misma clave de idempotencia).
   - **«Solo reservar»**: deja la reserva en HOLD (15 min).

   Pantalla final: código de confirmación grande, estado, cuenta atrás del hold si sigue en HOLD,
   datos adicionales devueltos por Carvi, y acciones según estado: «Confirmar pago» (HOLD),
   «Cancelar» (HOLD/CONFIRMED), «Ver en Reservas», «Nueva reserva». Los errores
   `VEHICLE_NOT_AVAILABLE` y `QUOTE_EXPIRED` ofrecen «Volver a cotizar» (vuelve al paso 1
   conservando fechas y vehículo).

Desaparecen del flujo principal «Repetir la última petición» y «Enviar importe incorrecto». El
panel técnico sigue mostrando cada petición con `Idempotency-Key`, `Idempotent-Replayed`, etc.

### Reservas (`/reservas`)

Tabla con filtros (estado, desde, hasta), paginación y panel lateral de detalle con: resumen,
sección **«Datos adicionales»** (tabla clave/valor; «Sin datos adicionales» si `null`), acciones
«Confirmar pago» / «Cancelar» según estado, y un desplegable «Ver respuesta JSON» cerrado por
defecto. Los diálogos de confirmar y cancelar se simplifican: el de pago muestra el importe y la
referencia generada (editable), sin casilla de importe incorrecto; el de cancelar pide un motivo
opcional y explica el importe reembolsable al cliente.

### Webhooks (`/webhooks`)

Tarjeta de configuración (URL, firma, token, y la recomendación de configurar un secreto en el
portal) y lista de eventos en vivo (SSE) con filtro por tipo. Badges por evento:

| `signatureStatus` | Badge |
| --- | --- |
| `VALID` | verde «Firmado ✓» |
| `UNSIGNED` | azul «Sin firma» (título: «la credencial no tiene secreto de webhook») |
| `UNVERIFIED` | ámbar «Firmado · sin verificar» |
| `INVALID` | rojo «Firma inválida · rechazado 401» (+ `reason`) |

`authStatus`: `VALID` → verde «Token ✓»; `MISSING`/`INVALID` → rojo «Token ✗ · rechazado 401»;
`NOT_REQUIRED` → sin badge. `duplicate` → gris «duplicado». Fila desplegable con cabeceras y sobre;
si el sobre trae `data.booking.metadata`, se muestra también como tabla clave/valor.

### Tipos y peticiones

`BookingInput.metadata?: Record<string, string | number | boolean>`;
`Booking.metadata: Record<string, string | number | boolean> | null`. Conversión de filas del
formulario a `metadata` en `src/lib/metadata.ts` (función pura con pruebas: recorta, descarta
filas con clave vacía, valida clave y longitud, convierte números y booleanos, devuelve
`undefined` si no queda nada).

## Verificación

`npm run lint && npm run typecheck && npm run build && npm test`, y recorrido manual con
Playwright contra el backend local: Inicio → Vehículos → Nueva reserva (con metadata) → Reservar y
pagar → Reservas (metadata visible) → Webhooks (`booking.confirmed` con «Sin firma» y, si hay
token, «Token ✓») → Cancelar → `booking.cancelled`.
