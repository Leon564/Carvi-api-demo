import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { PLACES, type Quote, type Vehicle } from '../../api/types';
import { Button, Card, Field, Input, Select } from '../../components/ui';
import type { PeriodInput } from '../../lib/dates';
import { METADATA_MAX_KEYS, rowsToMetadata } from '../../lib/metadata';
import { QuoteSummary } from './QuoteSummary';
import type { CustomerForm } from './wizardState';

const schema = z
  .object({
    fullName: z.string().trim().min(3, 'Escribe el nombre completo'),
    email: z.string().trim().email('Correo inválido'),
    phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Formato internacional, p. ej. +50370001234'),
    country: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Código de país de 2 letras, p. ej. SV'),
    externalReference: z.string().trim().max(64, 'Máximo 64 caracteres'),
    pickup: z.string().min(1),
    dropoff: z.string().min(1),
    metadata: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .superRefine((values, ctx) => {
    const { errors, totalError } = rowsToMetadata(values.metadata);
    for (const [index, message] of Object.entries(errors)) ctx.addIssue({ code: 'custom', path: ['metadata', Number(index)], message });
    if (totalError) ctx.addIssue({ code: 'custom', path: ['metadata'], message: totalError });
  });

const COUNTRIES = ['SV', 'GT', 'HN', 'NI', 'CR', 'PA', 'MX', 'US'];

// A fixed phone/email would collide with a customer already in the sandbox after the first
// booking, so both are randomized per attempt to avoid a 422 CLIENT_DATA_CONFLICT.
function demoCustomerDefaults(): CustomerForm {
  return {
    fullName: 'Ana Demo',
    email: `ana.demo+${Date.now().toString(36)}@example.com`,
    phone: '+5037' + String(Math.floor(1000000 + Math.random() * 8999999)),
    country: 'SV',
    externalReference: `DEMO-${Date.now().toString(36).toUpperCase()}`,
    pickup: 'AIRPORT',
    dropoff: 'AIRPORT',
    metadata: [
      { key: 'salesAgent', value: 'laura.m' },
      { key: 'passengers', value: '2' },
    ],
  };
}

interface Props {
  vehicle: Vehicle;
  period: PeriodInput;
  quote: Quote;
  customer: CustomerForm | null;
  onBack: () => void;
  onRenewed: (quote: Quote) => void;
  onNext: (customer: CustomerForm) => void;
}

export function StepCustomer({ vehicle, period, quote, customer, onBack, onRenewed, onNext }: Props) {
  const form = useForm<CustomerForm>({ resolver: zodResolver(schema), defaultValues: customer ?? demoCustomerDefaults() });
  const rows = useFieldArray({ control: form.control, name: 'metadata' });
  const errors = form.formState.errors;
  // The resolver may nest an array-level issue under `root` when the array is a field array.
  const metadataTotalError = errors.metadata?.root?.message ?? errors.metadata?.message;
  const submit = form.handleSubmit((values) => onNext(values));
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo" error={errors.fullName?.message}><Input {...form.register('fullName')} /></Field>
          <Field label="Correo" error={errors.email?.message}><Input type="email" {...form.register('email')} /></Field>
          <Field label="Teléfono" hint="Con prefijo internacional" error={errors.phone?.message}><Input {...form.register('phone')} /></Field>
          <Field label="País" hint="Código de 2 letras" error={errors.country?.message}>
            <Input list="countries" maxLength={2} {...form.register('country')} />
            <datalist id="countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Lugar de entrega" error={errors.pickup?.message}>
            <Select {...form.register('pickup')}>{PLACES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</Select>
          </Field>
          <Field label="Lugar de devolución" error={errors.dropoff?.message}>
            <Select {...form.register('dropoff')}>{PLACES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tu referencia (opcional)" hint="Tu propio identificador de la reserva" error={errors.externalReference?.message}>
              <Input {...form.register('externalReference')} />
            </Field>
          </div>

          <fieldset className="rounded-md border border-slate-200 p-3 sm:col-span-2">
            <legend className="px-1 text-sm font-medium text-slate-700">Datos adicionales (opcional)</legend>
            <p className="mb-2 text-xs text-slate-500">
              Información propia que Carvi guarda con la reserva y te devuelve en las consultas y los webhooks. Los números y true/false se envían con su tipo.
            </p>
            <div className="space-y-2">
              {rows.fields.map((field, index) => (
                <div key={field.id}>
                  <div className="grid grid-cols-[2fr_3fr_auto] gap-2">
                    <Input placeholder="clave" aria-label={`Clave ${index + 1}`} maxLength={40} {...form.register(`metadata.${index}.key`)} />
                    <Input placeholder="valor" aria-label={`Valor ${index + 1}`} {...form.register(`metadata.${index}.value`)} />
                    <Button type="button" variant="ghost" aria-label="Quitar" onClick={() => rows.remove(index)}><Trash2 size={14} /></Button>
                  </div>
                  {errors.metadata?.[index]?.message && <p className="mt-1 text-xs text-red-600">{errors.metadata[index]?.message}</p>}
                </div>
              ))}
            </div>
            {metadataTotalError && <p className="mt-2 text-xs text-red-600">{metadataTotalError}</p>}
            <Button type="button" variant="secondary" className="mt-2" disabled={rows.fields.length >= METADATA_MAX_KEYS} onClick={() => rows.append({ key: '', value: '' })}>
              <Plus size={14} /> Añadir dato
            </Button>
          </fieldset>

          <div className="flex justify-between sm:col-span-2">
            <Button type="button" variant="secondary" onClick={onBack}>Cambiar fechas o vehículo</Button>
            <Button type="submit">Continuar</Button>
          </div>
        </form>
      </Card>
      <QuoteSummary vehicle={vehicle} period={period} quote={quote} onRenewed={onRenewed} />
    </div>
  );
}
