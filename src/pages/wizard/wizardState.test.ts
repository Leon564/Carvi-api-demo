import { describe, expect, it } from 'vitest';
import type { Booking, PaymentInput, Quote, Vehicle } from '../../api/types';
import { buildBookingInput, initialWizardState, stepIndex, wizardReducer, type CustomerForm, type WizardState } from './wizardState';

const vehicle = { id: 'v1' } as Vehicle;
const quote = { quoteId: 'q1' } as Quote;
const booking = { id: 'b1', status: 'HOLD' } as Booking;
const payment: PaymentInput = { externalPaymentId: 'demo_pay_1', amount: 10, currency: 'USD' };
const customer: CustomerForm = {
  fullName: ' Ana Demo ',
  email: 'ana@example.com',
  phone: '+50370001234',
  country: 'sv',
  externalReference: '',
  pickup: 'AIRPORT',
  dropoff: 'SAN_SALVADOR',
  metadata: [{ key: 'agent', value: 'laura' }, { key: 'pax', value: '2' }, { key: '', value: '' }],
};

const quoted = (): WizardState => wizardReducer(initialWizardState(), { type: 'SET_QUOTE', vehicle, quote });
const withCustomer = (): WizardState => wizardReducer(quoted(), { type: 'SET_CUSTOMER', customer });

describe('wizardReducer', () => {
  it('starts on the search step with a default period and distinct keys', () => {
    const state = initialWizardState();
    expect(state).toMatchObject({ step: 'search', vehicle: null, quote: null, booking: null, payment: null });
    expect(state.keys.booking).toMatch(/[0-9a-f-]{36}/);
    expect(new Set(Object.values(state.keys)).size).toBe(3);
  });

  it('a new search period drops the quote and stays on the search step', () => {
    const state = wizardReducer(quoted(), { type: 'SET_PERIOD', period: { from: '2026-10-10', to: '2026-10-14', startTime: '10:00', endTime: '10:00' } });
    expect(state).toMatchObject({ step: 'search', quote: null, vehicle });
    expect(state.period.from).toBe('2026-10-10');
  });

  it('choosing a vehicle stores vehicle and quote and moves to the customer step', () => {
    expect(quoted()).toMatchObject({ step: 'customer', vehicle, quote });
  });

  it('rotates the booking key only when the quote or the customer data change', () => {
    const first = withCustomer();
    expect(first.step).toBe('confirm');
    const same = wizardReducer(first, { type: 'SET_CUSTOMER', customer: { ...customer } });
    expect(same.keys.booking).toBe(first.keys.booking);
    const edited = wizardReducer(first, { type: 'SET_CUSTOMER', customer: { ...customer, phone: '+50370009999' } });
    expect(edited.keys.booking).not.toBe(first.keys.booking);
    const renewed = wizardReducer(first, { type: 'RENEW_QUOTE', quote: { quoteId: 'q2' } as Quote });
    expect(renewed.keys.booking).not.toBe(first.keys.booking);
    expect(renewed.step).toBe('confirm');
    expect(renewed.keys.confirm).toBe(first.keys.confirm);
  });

  it('keeps the payment and the confirm key so a failed payment can be retried identically', () => {
    let state = wizardReducer(withCustomer(), { type: 'BOOKING_CREATED', booking });
    const confirmKey = state.keys.confirm;
    state = wizardReducer(state, { type: 'PAYMENT_PREPARED', payment });
    state = wizardReducer(state, { type: 'FINISH' });
    expect(state).toMatchObject({ step: 'done', booking, payment });
    expect(state.keys.confirm).toBe(confirmKey);
    const confirmed = { ...booking, status: 'CONFIRMED' } as Booking;
    state = wizardReducer(state, { type: 'BOOKING_UPDATED', booking: confirmed });
    expect(state.booking).toBe(confirmed);
  });

  it('FINISH needs a booking and GO_TO is ignored once the booking exists', () => {
    expect(wizardReducer(withCustomer(), { type: 'FINISH' }).step).toBe('confirm');
    const created = wizardReducer(withCustomer(), { type: 'BOOKING_CREATED', booking });
    expect(wizardReducer(created, { type: 'GO_TO', step: 'customer' }).step).toBe('confirm');
    expect(wizardReducer(withCustomer(), { type: 'GO_TO', step: 'customer' }).step).toBe('customer');
  });

  it('REQUOTE goes back to search keeping period, vehicle and customer with fresh keys', () => {
    let state = wizardReducer(withCustomer(), { type: 'BOOKING_CREATED', booking });
    state = wizardReducer(state, { type: 'PAYMENT_PREPARED', payment });
    const before = state;
    state = wizardReducer(state, { type: 'REQUOTE' });
    expect(state).toMatchObject({ step: 'search', vehicle, customer, period: before.period, quote: null, booking: null, payment: null });
    expect(state.keys.booking).not.toBe(before.keys.booking);
    expect(state.keys.confirm).not.toBe(before.keys.confirm);
  });

  it('RESET returns to a fresh state', () => {
    expect(wizardReducer(withCustomer(), { type: 'RESET' })).toMatchObject({ step: 'search', vehicle: null, customer: null });
  });
});

describe('buildBookingInput', () => {
  it('trims, upper-cases the country, omits an empty reference and types the metadata', () => {
    expect(buildBookingInput(quote, customer)).toEqual({
      quoteId: 'q1',
      customer: { fullName: 'Ana Demo', email: 'ana@example.com', phone: '+50370001234', country: 'SV' },
      pickup: { location: 'AIRPORT' },
      dropoff: { location: 'SAN_SALVADOR' },
      metadata: { agent: 'laura', pax: 2 },
    });
  });
  it('omits metadata when there are no rows', () => {
    const input = buildBookingInput(quote, { ...customer, externalReference: 'REF-1', metadata: [] });
    expect(input).not.toHaveProperty('metadata');
    expect(input.externalReference).toBe('REF-1');
  });
});

describe('stepIndex', () => {
  it('maps steps to positions and done past the last one', () => {
    expect(stepIndex('search')).toBe(0);
    expect(stepIndex('confirm')).toBe(2);
    expect(stepIndex('done')).toBe(3);
  });
});
