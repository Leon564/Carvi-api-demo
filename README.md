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
El túnel solo debe usarse para `/webhooks/carvi`: el resto de rutas del servidor del demo rechazan
peticiones cuyo `Host` no sea `localhost`.

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
