import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useCreateBooking } from '../../api/hooks';
import { createBooking } from '../../api/requests';
import { PLACES, type Booking, type BookingInput, type Quote } from '../../api/types';
import type { LastOperation } from '../../components/booking/types';
import { Button, Card, Field, Input, Select } from '../../components/ui';
import { guidanceFor } from '../../lib/guidance';
import { notifyError } from '../../lib/notify';

const schema = z.object({
  fullName: z.string().trim().min(3, 'Nombre completo'),
  email: z.string().trim().email('Correo inválido'),
  phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Formato internacional, p. ej. +50370001234'),
  country: z.string().trim().length(2, 'ISO-3166 alpha-2, p. ej. SV'),
  externalReference: z.string().trim().max(64, 'Máximo 64 caracteres'),
  pickup: z.string().min(1),
  dropoff: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  quote: Quote;
  idempotencyKey: string;
  onBack: () => void;
  onBooked: (booking: Booking) => void;
  onExecuted: (op: LastOperation) => void;
}

const COUNTRIES = ['SV', 'GT', 'HN', 'NI', 'CR', 'PA', 'MX', 'US'];

// A fixed phone/email would collide with a customer already in the sandbox after the first
// booking, so both are randomized per attempt to avoid a 422 CLIENT_DATA_CONFLICT.
function demoCustomerDefaults(): FormValues {
  return {
    fullName: 'Ana Demo',
    email: `ana.demo+${Date.now().toString(36)}@example.com`,
    phone: '+5037' + String(Math.floor(1000000 + Math.random() * 8999999)),
    country: 'SV',
    externalReference: `DEMO-${Date.now().toString(36).toUpperCase()}`,
    pickup: 'AIRPORT',
    dropoff: 'AIRPORT',
  };
}

export function StepCustomer({ quote, idempotencyKey, onBack, onBooked, onExecuted }: Props) {
  const create = useCreateBooking();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: demoCustomerDefaults(),
  });
  const error = create.error;
  const submit = form.handleSubmit(async (values) => {
    const input: BookingInput = {
      quoteId: quote.quoteId,
      externalReference: values.externalReference || undefined,
      customer: { fullName: values.fullName, email: values.email, phone: values.phone, country: values.country.toUpperCase() },
      pickup: { location: values.pickup },
      dropoff: { location: values.dropoff },
    };
    onExecuted({ label: 'POST /bookings', run: () => createBooking(input, idempotencyKey) });
    try {
      onBooked(await create.mutateAsync({ input, idempotencyKey }));
    } catch (err) {
      notifyError(err);
    }
  });
  const err = (name: keyof FormValues) => form.formState.errors[name]?.message;
  return (
    <Card className="max-w-2xl">
      <p className="mb-4 text-sm text-slate-600"><code>POST /bookings</code> con la cabecera <code>Idempotency-Key</code> crea la reserva en <strong>HOLD</strong> durante 15 minutos. La cotización no se consume.</p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre completo" error={err('fullName')}><Input {...form.register('fullName')} /></Field>
        <Field label="Correo" error={err('email')}><Input type="email" {...form.register('email')} /></Field>
        <Field label="Teléfono (internacional)" error={err('phone')}><Input {...form.register('phone')} /></Field>
        <Field label="País (alpha-2)" error={err('country')}>
          <Input list="countries" maxLength={2} {...form.register('country')} />
          <datalist id="countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Lugar de entrega" error={err('pickup')}>
          <Select {...form.register('pickup')}>{PLACES.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}</Select>
        </Field>
        <Field label="Lugar de devolución" error={err('dropoff')}>
          <Select {...form.register('dropoff')}>{PLACES.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.label}</option>)}</Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="externalReference (opcional, tu propio identificador)" error={err('externalReference')}><Input {...form.register('externalReference')} /></Field>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">
            <div>{error.code} · {error.message}</div>
            {guidanceFor(error.code) && <div className="mt-1">{guidanceFor(error.code)}</div>}
            {error.code === 'CLIENT_DATA_CONFLICT' && <div className="mt-1">Campo: <code>{String((error.details as { field?: string } | null)?.field ?? '')}</code></div>}
          </div>
        )}
        <p className="text-xs text-slate-500 sm:col-span-2">Idempotency-Key: <code>{idempotencyKey}</code></p>
        <div className="flex justify-between sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onBack}>Volver a la cotización</Button>
          <Button type="submit" disabled={create.isPending}>Crear reserva (HOLD)</Button>
        </div>
      </form>
    </Card>
  );
}
