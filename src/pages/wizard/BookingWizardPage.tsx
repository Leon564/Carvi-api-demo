import { Check } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBooking } from '../../api/hooks';
import { PageTitle, cn } from '../../components/ui';
import { BookingDone } from './BookingDone';
import { StepConfirm } from './StepConfirm';
import { StepCustomer } from './StepCustomer';
import { StepSearch } from './StepSearch';
import { useBookingFlow } from './useBookingFlow';
import { initialWizardState, STEPS, stepIndex, wizardReducer } from './wizardState';

export function BookingWizardPage() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const flow = useBookingFlow(state, dispatch);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedId = state.vehicle?.id ?? params.get('vehicleId') ?? undefined;
  const current = stepIndex(state.step);
  const canGoBack = !state.booking && flow.phase === 'idle';

  // On the last step the booking is read from the query cache too, so a webhook (which
  // invalidates it) or a change made elsewhere shows up here without reloading.
  const live = useBooking(state.step === 'done' ? state.booking?.id : undefined).data;
  useEffect(() => {
    if (!live || !state.booking || live.id !== state.booking.id || live.updatedAt === state.booking.updatedAt) return;
    if (new Date(live.updatedAt).getTime() < new Date(state.booking.updatedAt).getTime()) return;
    dispatch({ type: 'BOOKING_UPDATED', booking: live });
  }, [live, state.booking]);

  const requote = () => {
    flow.clearError();
    dispatch({ type: 'REQUOTE' });
  };
  const startOver = () => {
    flow.clearError();
    setParams({}, { replace: true });
    dispatch({ type: 'RESET' });
  };

  return (
    <>
      <PageTitle title="Nueva reserva" subtitle="Elige fechas y vehículo, completa los datos de tu cliente y confirma." />
      <ol className="mb-6 flex flex-wrap gap-2 text-sm">
        {STEPS.map((step, index) => {
          const done = index < current;
          const clickable = done && canGoBack;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => dispatch({ type: 'GO_TO', step: step.id })}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1',
                  index === current ? 'bg-carvi text-white' : done ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500',
                  clickable && 'hover:bg-sky-200',
                )}
              >
                {done ? <Check size={14} /> : <span>{index + 1}.</span>} {step.title}
              </button>
            </li>
          );
        })}
      </ol>

      {state.step === 'search' && (
        <StepSearch
          period={state.period}
          preselectedId={preselectedId}
          onSearch={(period) => dispatch({ type: 'SET_PERIOD', period })}
          onQuoted={(vehicle, quote) => dispatch({ type: 'SET_QUOTE', vehicle, quote })}
        />
      )}
      {state.step === 'customer' && state.vehicle && state.quote && (
        <StepCustomer
          vehicle={state.vehicle}
          period={state.period}
          quote={state.quote}
          customer={state.customer}
          onBack={() => dispatch({ type: 'GO_TO', step: 'search' })}
          onRenewed={(quote) => dispatch({ type: 'RENEW_QUOTE', quote })}
          onNext={(customer) => dispatch({ type: 'SET_CUSTOMER', customer })}
        />
      )}
      {state.step === 'confirm' && state.vehicle && state.quote && state.customer && (
        <StepConfirm
          vehicle={state.vehicle}
          period={state.period}
          quote={state.quote}
          customer={state.customer}
          flow={flow}
          onEdit={() => {
            flow.clearError();
            dispatch({ type: 'GO_TO', step: 'customer' });
          }}
          onRenewed={(quote) => {
            flow.clearError();
            dispatch({ type: 'RENEW_QUOTE', quote });
          }}
          onRequote={requote}
        />
      )}
      {state.step === 'done' && state.booking && (
        <BookingDone
          booking={state.booking}
          cancelKey={state.keys.cancel}
          paymentAttempted={state.payment !== null}
          flow={flow}
          onBookingUpdated={(booking) => dispatch({ type: 'BOOKING_UPDATED', booking })}
          onViewInBookings={() => navigate(`/reservas?id=${state.booking?.id}`)}
          onNew={startOver}
          onRequote={requote}
        />
      )}
    </>
  );
}
