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
