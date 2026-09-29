# Demo de socio · API de integración de Carvi

Aplicación de demostración que simula la herramienta interna de un **socio de distribución** (una
agencia que reserva coches para sus clientes) consumiendo la API de máquina de Carvi
(`/integrations/v1`): token, salud, catálogo, disponibilidad, cotización, reserva en hold,
confirmación con el pago del canal, cancelación, `metadata` de reserva y recepción de webhooks
(firmados o sin firma, con token de autorización opcional).

No es producto: todo el estado del servidor vive en memoria y se pierde al reiniciarlo.

## Cómo funciona

- `server/` (Express, puerto **4020**) guarda el `client_secret`, pide y cachea el token, reenvía
  `/api/carvi/*` a Carvi con `Authorization`, `X-Request-Id` e `Idempotency-Key`, registra cada
  intercambio HTTP y recibe los webhooks en `POST /webhooks/carvi`.
- `src/` (Vite + React, puerto **5176**) solo habla con el servidor local. Pantallas: **Inicio**,
  **Vehículos**, **Nueva reserva** (3 pasos), **Reservas** y **Webhooks**, más un panel técnico con
  las peticiones y respuestas crudas (se abre solo cuando Carvi responde un error).

## Puesta en marcha

1. Consigue una credencial con los scopes `catalog:read` y `booking:write` y
   `webhookUrl = http://localhost:4020/webhooks/carvi`. Puedes crearla desde el portal de
   integraciones o pedirla a Carvi. El secreto de webhook y el token de autorización son
   opcionales:
   - **sin secreto**, Carvi entrega los eventos igual, pero sin la cabecera `X-Carvi-Signature`;
   - **con secreto**, cada entrega llega firmada y el demo la verifica;
   - **con `webhookAuthToken`**, cada entrega lleva `Authorization: Bearer <token>` y el demo lo
     exige.
   Copia el `client_secret` (y el secreto de webhook si lo hay): se muestran una sola vez.
2. Arranca el backend de Carvi en local (puerto 3000) o apunta a un despliegue.
3. Configura el demo:

   ```bash
   cp .env.example .env   # y rellena CARVI_CLIENT_ID y CARVI_CLIENT_SECRET
   npm install
   npm run dev            # web en http://localhost:5176, servidor en :4020
   ```

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `CARVI_API_BASE_URL` | URL base de la API de socios, con `/integrations/v1` | `http://localhost:3000/integrations/v1` |
| `CARVI_CLIENT_ID` | `client_id` de la credencial | obligatoria |
| `CARVI_CLIENT_SECRET` | `client_secret` de la credencial | obligatoria |
| `CARVI_WEBHOOK_SECRETS` | Secretos de webhook separados por coma (dos durante una rotación) | vacío: la credencial no tiene secreto, las entregas llegan «sin firma» |
| `CARVI_WEBHOOK_AUTH_TOKEN` | El `webhookAuthToken` configurado en la credencial; si se define, el demo exige `Authorization: Bearer` | vacío: no se exige |
| `PORT` | Puerto del servidor local | `4020` |
| `PUBLIC_WEBHOOK_URL` | URL pública a configurar como `webhookUrl` | `http://localhost:4020/webhooks/carvi` |

Contra un backend desplegado, Carvi no puede llegar a `localhost`: publica el puerto 4020 con un
túnel (por ejemplo `ngrok http 4020`) y pon esa URL en `PUBLIC_WEBHOOK_URL` y en el portal.
El túnel solo debe usarse para `/webhooks/carvi`: el resto de rutas del servidor del demo rechazan
peticiones cuyo `Host` no sea `localhost`.

## Cómo trata el demo cada entrega de webhook

| Secretos configurados | `X-Carvi-Signature` | Resultado | Respuesta |
| --- | --- | --- | --- |
| sí | válida | **Firmado ✓** | 200 |
| sí | inválida, vieja (> 5 min) o ausente | **Firma inválida** | 401 `INVALID_SIGNATURE` |
| no | ausente | **Sin firma** (así llegan cuando la credencial no tiene secreto) | 200 |
| no | presente | **Firmado · sin verificar** | 200 |

Si `CARVI_WEBHOOK_AUTH_TOKEN` está definido, además se exige `Authorization: Bearer <token>`
(**Token ✓**); si falta o no coincide, 401 `INVALID_AUTH_TOKEN`. Una entrega rechazada no entra
en la deduplicación por `eventId`, así el reintento de Carvi no se marca como duplicado.

## Recorrido sugerido

1. **Inicio**: comprueba la conexión (entorno, credencial, scopes) y cómo está configurado el
   webhook (firma y token). Abre el panel técnico y mira el `POST /auth/token`.
2. **Vehículos**: catálogo publicado; «Reservar» lleva al asistente con el vehículo elegido.
3. **Nueva reserva**: fechas y vehículo disponible → datos del cliente y «Datos adicionales»
   (la `metadata` que Carvi guarda y devuelve tal cual) → «Reservar y pagar» (hold + pago simulado
   del canal) o «Solo reservar» (hold de 15 minutos).
4. **Reservas**: lista con filtros, detalle con los datos adicionales, confirmar pago y cancelar.
5. **Webhooks**: cada confirmación o cancelación llega con su estado de firma y de token. Sin
   backend, prueba con `node scripts/send-test-webhook.mjs --unsigned` (o `--secret <s>` y
   `--token <t>`).

## Verificación

```bash
npm run lint && npm run typecheck && npm run build && npm test
```

Las pruebas (vitest) cubren la lógica pura del servidor (evaluación de firma y token de cada
entrega, caché del token, configuración, proxy y registro de intercambios) y del front (regla de
días de calendario, conversión de los datos adicionales a `metadata`, estado del asistente).
