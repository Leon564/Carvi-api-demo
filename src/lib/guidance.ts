const GUIDANCE: Record<string, string> = {
  VEHICLE_NOT_AVAILABLE: 'El vehículo ya no está libre en esas fechas. Vuelve a cotizar y elige otro vehículo o cambia las fechas.',
  QUOTE_EXPIRED: 'La cotización venció (dura 15 minutos). Vuelve a cotizar.',
  HOLD_EXPIRED: 'La reserva en espera venció hace más de 2 minutos. Reembolsa a tu cliente por tu lado y crea una reserva nueva.',
  CLIENT_DATA_CONFLICT: 'El teléfono o el correo ya pertenecen a otro cliente. Cambia el dato indicado.',
  RATE_LIMITED: 'Demasiadas peticiones en un minuto. Espera unos segundos (Retry-After en el panel técnico) y vuelve a intentarlo.',
  BOOKING_STATE_CONFLICT: 'La reserva no admite esa acción en su estado actual.',
  IDEMPOTENCY_MISMATCH: 'Se reutilizó una clave de idempotencia con otros datos. Empieza la operación de nuevo.',
  VALIDATION_ERROR: 'Algún dato no es válido; el panel técnico muestra el detalle.',
  UPSTREAM_UNREACHABLE: 'No hay conexión con la API de Carvi. Comprueba que el backend esté arrancado.',
};

export const guidanceFor = (code: string): string | null => GUIDANCE[code] ?? null;

/** Errors after which the only way forward is a fresh quote. */
export const needsRequote = (code: string | undefined): boolean => code === 'VEHICLE_NOT_AVAILABLE' || code === 'QUOTE_EXPIRED';
