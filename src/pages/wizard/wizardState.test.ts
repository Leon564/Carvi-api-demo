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
