import type { Booking, BookingInput, PaymentInput, Quote, Vehicle } from '../../api/types';
import { defaultPeriod, type PeriodInput } from '../../lib/dates';
import { newIdempotencyKey } from '../../lib/idempotency';
import { rowsToMetadata, type MetadataRow } from '../../lib/metadata';

export type Step = 'search' | 'customer' | 'confirm' | 'done';

export const STEPS: Array<{ id: Exclude<Step, 'done'>; title: string }> = [
  { id: 'search', title: 'Fechas y vehículo' },
  { id: 'customer', title: 'Datos del cliente' },
  { id: 'confirm', title: 'Confirmar' },
];

export interface CustomerForm {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  externalReference: string;
  pickup: string;
  dropoff: string;
  metadata: MetadataRow[];
}

export interface WizardKeys { booking: string; confirm: string; cancel: string }

export interface WizardState {
  step: Step;
  period: PeriodInput;
  vehicle: Vehicle | null;
  quote: Quote | null;
  customer: CustomerForm | null;
  booking: Booking | null;
  /** The simulated payment of this attempt; kept so a retry sends the same body with the same key. */
  payment: PaymentInput | null;
  /** One idempotency key per logical operation of this booking attempt. */
  keys: WizardKeys;
}

export type WizardAction =
  | { type: 'SET_PERIOD'; period: PeriodInput }
  | { type: 'SET_QUOTE'; vehicle: Vehicle; quote: Quote }
  | { type: 'RENEW_QUOTE'; quote: Quote }
  | { type: 'SET_CUSTOMER'; customer: CustomerForm }
  | { type: 'GO_TO'; step: Exclude<Step, 'done'> }
  | { type: 'BOOKING_CREATED'; booking: Booking }
  | { type: 'PAYMENT_PREPARED'; payment: PaymentInput }
  | { type: 'BOOKING_UPDATED'; booking: Booking }
  | { type: 'FINISH' }
  | { type: 'REQUOTE' }
  | { type: 'RESET' };

const freshKeys = (): WizardKeys => ({ booking: newIdempotencyKey(), confirm: newIdempotencyKey(), cancel: newIdempotencyKey() });

export function initialWizardState(): WizardState {
  return { step: 'search', period: defaultPeriod(), vehicle: null, quote: null, customer: null, booking: null, payment: null, keys: freshKeys() };
}

/** A different request body is a different logical operation, so it gets a new key; the same body keeps it. */
const withBookingKey = (state: WizardState, changed: boolean): WizardKeys =>
  changed ? { ...state.keys, booking: newIdempotencyKey() } : state.keys;

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PERIOD':
      return state.booking ? state : { ...state, period: action.period, quote: null, step: 'search' };
    case 'SET_QUOTE':
      return {
        ...state,
        vehicle: action.vehicle,
        quote: action.quote,
        keys: withBookingKey(state, state.quote?.quoteId !== action.quote.quoteId),
        step: 'customer',
      };
    case 'RENEW_QUOTE':
      return { ...state, quote: action.quote, keys: withBookingKey(state, state.quote?.quoteId !== action.quote.quoteId) };
    case 'SET_CUSTOMER':
      return {
        ...state,
        customer: action.customer,
        keys: withBookingKey(state, JSON.stringify(state.customer) !== JSON.stringify(action.customer)),
        step: 'confirm',
      };
    case 'GO_TO':
      // Once the booking exists the attempt can only move forward.
      return state.booking ? state : { ...state, step: action.step };
    case 'BOOKING_CREATED':
      return { ...state, booking: action.booking };
    case 'PAYMENT_PREPARED':
      return { ...state, payment: action.payment };
    case 'BOOKING_UPDATED':
      return { ...state, booking: action.booking };
    case 'FINISH':
      return state.booking ? { ...state, step: 'done' } : state;
    case 'REQUOTE':
      // New attempt that keeps the dates, the vehicle and the customer data.
      return { ...state, step: 'search', quote: null, booking: null, payment: null, keys: freshKeys() };
    case 'RESET':
      return initialWizardState();
  }
}

/** The body of `POST /bookings` for the current quote and customer form. */
export function buildBookingInput(quote: Quote, customer: CustomerForm): BookingInput {
  const { metadata } = rowsToMetadata(customer.metadata);
  const externalReference = customer.externalReference.trim();
  return {
    quoteId: quote.quoteId,
    ...(externalReference ? { externalReference } : {}),
    customer: {
      fullName: customer.fullName.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim(),
      country: customer.country.trim().toUpperCase(),
    },
    pickup: { location: customer.pickup },
    dropoff: { location: customer.dropoff },
    ...(metadata ? { metadata } : {}),
  };
}

export const stepIndex = (step: Step): number => (step === 'done' ? STEPS.length : STEPS.findIndex((s) => s.id === step));
