import { useState, type ChangeEvent } from 'react';
import { Button, Card, Field, Input } from '../../components/ui';
import { calendarDaysInclusive, MIN_RENT_DAYS, type PeriodInput } from '../../lib/dates';

export function StepPeriod({ period, onNext }: { period: PeriodInput; onNext: (period: PeriodInput) => void }) {
  const [form, setForm] = useState(period);
  const days = form.from && form.to ? calendarDaysInclusive(form.from, form.to) : 0;
  const tooShort = days > 0 && days < MIN_RENT_DAYS;
  const set = (key: keyof PeriodInput) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  return (
    <Card className="max-w-xl">
      <p className="mb-4 text-sm text-slate-600">Fechas en <code>YYYY-MM-DD</code> (zona America/El_Salvador) y horas <code>HH:mm</code>. Son los parámetros de <code>GET /availability</code> y <code>POST /quotes</code>.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde"><Input type="date" value={form.from} onChange={set('from')} /></Field>
        <Field label="Hasta"><Input type="date" value={form.to} onChange={set('to')} /></Field>
        <Field label="Hora de entrega"><Input type="time" value={form.startTime} onChange={set('startTime')} /></Field>
        <Field label="Hora de devolución"><Input type="time" value={form.endTime} onChange={set('endTime')} /></Field>
      </div>
      <p className={tooShort ? 'mt-3 text-sm text-amber-700' : 'mt-3 text-sm text-slate-500'}>
        {days > 0 ? `${days} día(s) de calendario.` : ''}{' '}
        {tooShort && `La renta debe tener mínimo ${MIN_RENT_DAYS} días (to − from + 1). Puedes continuar igual para ver el 400 VALIDATION_ERROR real al cotizar.`}
      </p>
      <div className="mt-4 flex justify-end">
        <Button disabled={!form.from || !form.to || !form.startTime || !form.endTime} onClick={() => onNext(form)}>Buscar disponibilidad</Button>
      </div>
    </Card>
  );
}
