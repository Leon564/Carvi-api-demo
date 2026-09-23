import { useReducer, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LastOperation } from '../../components/booking/types';
import { PageTitle, cn } from '../../components/ui';
import { StepBooking } from './StepBooking';
import { StepCustomer } from './StepCustomer';
import { StepPeriod } from './StepPeriod';
import { StepQuote } from './StepQuote';
import { StepVehicle } from './StepVehicle';
import { initialWizardState, STEP_TITLES, wizardReducer, type Step } from './wizardState';

export function BookingWizardPage() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [lastOp, setLastOp] = useState<LastOperation | null>(null);
  const [params, setParams] = useSearchParams();
  const preselectedId = params.get('vehicleId') ?? undefined;
  const steps = [1, 2, 3, 4, 5] as Step[];
  return (
    <>
      <PageTitle title="Reservar" subtitle="El flujo de reserva de la guía: disponibilidad → cotización → hold de 15 minutos → confirmación con el pago del canal." />
      <ol className="mb-6 flex gap-2 text-sm">
        {steps.map((step) => (
          <li key={step} className={cn('rounded-full px-3 py-1', step === state.step ? 'bg-carvi text-white' : step < state.step ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-500')}>
            {step}. {STEP_TITLES[step]}
          </li>
        ))}
      </ol>
      {state.step === 1 && <StepPeriod period={state.period} onNext={(period) => dispatch({ type: 'SET_PERIOD', period })} />}
      {state.step === 2 && (
        <StepVehicle period={state.period} preselectedId={preselectedId} onBack={() => dispatch({ type: 'GO_TO', step: 1 })} onSelect={(vehicle) => dispatch({ type: 'SELECT_VEHICLE', vehicle })} />
      )}
      {state.step === 3 && state.vehicle && (
        <StepQuote
          vehicle={state.vehicle}
          period={state.period}
          quote={state.quote}
          onQuote={(quote) => dispatch({ type: 'SET_QUOTE', quote })}
          onBack={() => dispatch({ type: 'GO_TO', step: 2 })}
          onNext={() => dispatch({ type: 'GO_TO', step: 4 })}
        />
      )}
      {state.step === 4 && state.quote && (
        <StepCustomer
          quote={state.quote}
          idempotencyKey={state.keys.booking}
          onBack={() => dispatch({ type: 'GO_TO', step: 3 })}
          onBooked={(booking) => dispatch({ type: 'SET_BOOKING', booking })}
          onExecuted={setLastOp}
        />
      )}
      {state.step === 5 && state.booking && state.quote && (
        <StepBooking
          booking={state.booking}
          quote={state.quote}
          keys={state.keys}
          lastOp={lastOp}
          onExecuted={setLastOp}
          onBookingUpdated={(booking) => dispatch({ type: 'SET_BOOKING', booking })}
          onNew={() => { setLastOp(null); setParams({}, { replace: true }); dispatch({ type: 'RESET' }); }}
          onReuseQuote={() => { setLastOp(null); dispatch({ type: 'REUSE_QUOTE' }); }}
        />
      )}
    </>
  );
}
