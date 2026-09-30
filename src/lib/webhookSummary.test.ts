import { describe, expect, it } from 'vitest';
import { summarizeWebhook, webhookBookingId, webhookConfirmationCode } from './webhookSummary';

const envelope = (type: string, data: unknown) => ({ eventId: 'evt_1', type, occurredAt: '2026-09-30T10:00:00.000Z', data });

describe('summarizeWebhook', () => {
  it('summarizes a booking event with its code and status', () => {
    const payload = envelope('booking.confirmed', { bookingId: 'b1', externalReference: null, confirmationCode: 'CV-ABC123', status: 'CONFIRMED', booking: {} });
    expect(summarizeWebhook('booking.confirmed', payload)).toBe('CV-ABC123 · Confirmada');
  });

  it('adds reason and refund to booking.cancelled', () => {
    const payload = envelope('booking.cancelled', {
      bookingId: 'b1',
      confirmationCode: 'CV-ABC123',
      status: 'CANCELLED',
      booking: {},
      reason: 'CUSTOMER_REQUEST',
      refund: { responsibility: 'PARTNER', refundableAmount: 42.5, currency: 'USD', settlement: 'NONE' },
    });
    expect(summarizeWebhook('booking.cancelled', payload)).toBe('CV-ABC123 · Cancelada · motivo: a petición de tu cliente · reembolsas a tu cliente $42.50 USD · lo asumes tú · sin efecto en tu liquidación');
  });

  it('marks Carvi as responsible when the host cancelled', () => {
    const payload = envelope('booking.cancelled', {
      confirmationCode: 'CV-XYZ999',
      status: 'CANCELLED',
      reason: 'HOST_CANCELLED',
      refund: { responsibility: 'CARVI', refundableAmount: 100, currency: 'USD', settlement: 'DEDUCTED_FROM_SETTLEMENT' },
    });
    expect(summarizeWebhook('booking.cancelled', payload)).toBe('CV-XYZ999 · Cancelada · motivo: la canceló el anfitrión · reembolsas a tu cliente $100.00 USD · lo asume Carvi · se descuenta de tu liquidación');
  });

  it('keeps unknown codes readable', () => {
    const payload = envelope('booking.cancelled', { confirmationCode: 'CV-1', status: 'SOMETHING', reason: 'NEW_REASON' });
    expect(summarizeWebhook('booking.cancelled', payload)).toBe('CV-1 · SOMETHING · motivo: NEW_REASON');
  });

  it('does not add reason or refund to other booking events', () => {
    const payload = envelope('booking.expired', { confirmationCode: 'CV-2', status: 'EXPIRED', reason: 'CUSTOMER_REQUEST' });
    expect(summarizeWebhook('booking.expired', payload)).toBe('CV-2 · Vencida');
  });

  it('summarizes vehicle.unpublished with the id and reason', () => {
    expect(summarizeWebhook('vehicle.unpublished', envelope('vehicle.unpublished', { vehicleId: 'v42', reason: 'HOST_UNPUBLISHED' }))).toBe(
      'Vehículo v42 despublicado · motivo: HOST_UNPUBLISHED',
    );
    expect(summarizeWebhook('vehicle.unpublished', envelope('vehicle.unpublished', { vehicleId: 'v42', vehicle: { brand: 'Toyota', model: 'Yaris' } }))).toBe(
      'Vehículo Toyota Yaris · v42 despublicado',
    );
  });

  it('summarizes settlement.status_changed', () => {
    const payload = envelope('settlement.status_changed', {
      settlementId: 's1',
      channel: 'agency',
      period: { from: '2026-09-01', to: '2026-09-15' },
      status: 'PAID',
      finalTotal: 310.4,
      currency: 'USD',
      paymentReference: 'TRX-9',
    });
    expect(summarizeWebhook('settlement.status_changed', payload)).toBe('Liquidación s1 → Pagada · periodo 2026-09-01 → 2026-09-15 · $310.40 USD · ref. TRX-9');
    const submitted = envelope('settlement.status_changed', { settlementId: 's2', status: 'SUBMITTED', paymentReference: null });
    expect(summarizeWebhook('settlement.status_changed', submitted)).toBe('Liquidación s2 → Enviada');
  });

  it('returns null for unknown types and malformed payloads', () => {
    expect(summarizeWebhook('something.else', envelope('something.else', {}))).toBeNull();
    expect(summarizeWebhook('booking.confirmed', null)).toBeNull();
    expect(summarizeWebhook('booking.confirmed', { data: [] })).toBeNull();
  });
});

describe('webhookBookingId / webhookConfirmationCode', () => {
  it('reads data.bookingId and data.confirmationCode', () => {
    const payload = envelope('booking.expired', { bookingId: 'b9', confirmationCode: 'CV-9' });
    expect(webhookBookingId(payload)).toBe('b9');
    expect(webhookConfirmationCode(payload)).toBe('CV-9');
    expect(webhookBookingId(envelope('settlement.status_changed', { settlementId: 's1' }))).toBeNull();
  });
});
