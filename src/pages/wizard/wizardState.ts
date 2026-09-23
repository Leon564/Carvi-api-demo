import type { Booking, Quote, Vehicle } from '../../api/types';
import { defaultPeriod, type PeriodInput } from '../../lib/dates';
import { newIdempotencyKey } from '../../lib/idempotency';

export type Step = 1 | 2 | 3 | 4 | 5;

export interface WizardKeys { booking: string; confirm: string; cancel: string }

export interface WizardState {
  step: Step;
  period: PeriodInput;
  vehicle: Vehicle | null;
  quote: Quote | null;
  booking: Booking | null;
  /** One idempotency key per logical operation of this booking attempt. */
  keys: WizardKeys;
}

export type WizardAction =
  | { type: 'SET_PERIOD'; period: PeriodInput }
  | { type: 'SELECT_VEHICLE'; vehicle: Vehicle }
  | { type: 'SET_QUOTE'; quote: Quote }
  | { type: 'SET_BOOKING'; booking: Booking }
  | { type: 'GO_TO'; step: Step }
  | { type: 'RESET' }
  | { type: 'REUSE_QUOTE' };

const freshKeys = (): WizardKeys => ({ booking: newIdempotencyKey(), confirm: newIdempotencyKey(), cancel: newIdempotencyKey() });

export function initialWizardState(): WizardState {
  return { step: 1, period: defaultPeriod(), vehicle: null, quote: null, booking: null, keys: freshKeys() };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PERIOD':
      return { ...state, period: action.period, vehicle: null, quote: null, step: 2 };
    case 'SELECT_VEHICLE':
      return { ...state, vehicle: action.vehicle, quote: null, step: 3 };
    case 'SET_QUOTE':
      return { ...state, quote: action.quote, step: 3 };
    case 'SET_BOOKING':
      return { ...state, booking: action.booking, step: 5 };
    case 'GO_TO':
      return { ...state, step: action.step };
    case 'RESET':
      return initialWizardState();
    case 'REUSE_QUOTE':
      return { ...state, booking: null, keys: freshKeys(), step: 4 };
  }
}

export const STEP_TITLES: Record<Step, string> = { 1: 'Periodo', 2: 'Vehículo', 3: 'Cotización', 4: 'Cliente y lugares', 5: 'Reserva' };
