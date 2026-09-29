import { useCallback, useState, type Dispatch } from 'react';
import { toast } from 'sonner';
import { CarviApiError } from '../../api/client';
import { useConfirmBooking, useCreateBooking } from '../../api/hooks';
import type { Booking, PaymentInput } from '../../api/types';
import { newExternalPaymentId } from '../../lib/idempotency';
import { buildBookingInput, type WizardAction, type WizardState } from './wizardState';

export type FlowPhase = 'idle' | 'creating' | 'paying';
export interface FlowError { stage: 'create' | 'pay'; error: CarviApiError }

const asApiError = (err: unknown): CarviApiError =>
  err instanceof CarviApiError ? err : new CarviApiError(0, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : String(err));

/** Creates the booking (HOLD) and registers the simulated payment, reusing the attempt's idempotency keys. */
export function useBookingFlow(state: WizardState, dispatch: Dispatch<WizardAction>) {
  const createBooking = useCreateBooking();
  const confirmBooking = useConfirmBooking();
  const [phase, setPhase] = useState<FlowPhase>('idle');
  const [error, setError] = useState<FlowError | null>(null);

  const pay = async (booking: Booking): Promise<void> => {
    // The same body with the same key: a retry after a network error is replayed, never charged twice.
    const payment: PaymentInput = state.payment ?? { externalPaymentId: newExternalPaymentId(), amount: booking.pricing.amountDue, currency: 'USD' };
    if (!state.payment) dispatch({ type: 'PAYMENT_PREPARED', payment });
    setPhase('paying');
    setError(null);
    try {
      const confirmed = await confirmBooking.mutateAsync({ id: booking.id, payment, idempotencyKey: state.keys.confirm });
      dispatch({ type: 'BOOKING_UPDATED', booking: confirmed });
      toast.success(`Reserva ${confirmed.confirmationCode} confirmada`);
    } catch (err) {
      setError({ stage: 'pay', error: asApiError(err) });
    } finally {
      setPhase('idle');
    }
  };

  const create = async (andPay: boolean): Promise<void> => {
    if (!state.quote || !state.customer) return;
    setPhase('creating');
    setError(null);
    let booking: Booking;
    try {
      booking = await createBooking.mutateAsync({ input: buildBookingInput(state.quote, state.customer), idempotencyKey: state.keys.booking });
    } catch (err) {
      setError({ stage: 'create', error: asApiError(err) });
      setPhase('idle');
      return;
    }
    dispatch({ type: 'BOOKING_CREATED', booking });
    if (andPay) await pay(booking);
    else toast.success(`Reserva ${booking.confirmationCode} creada en espera de pago`);
    setPhase('idle');
    dispatch({ type: 'FINISH' });
  };

  const clearError = useCallback(() => setError(null), []);

  return {
    phase,
    error,
    clearError,
    createAndPay: () => create(true),
    createOnly: () => create(false),
    pay: () => (state.booking ? pay(state.booking) : Promise.resolve()),
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
