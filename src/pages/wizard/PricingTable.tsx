import type { Pricing } from '../../api/types';
import { money } from '../../lib/format';

export function PricingTable({ pricing }: { pricing: Pricing }) {
  const rows: Array<[string, string]> = [
    ['Tarifa por día', money(pricing.rateDay)],
    ['Días facturados', `${pricing.totalDays} (${pricing.totalHours} h)`],
    ['Subtotal', money(pricing.subtotal)],
    ['Anticipo', money(pricing.advance)],
    ['Cargo de servicio', money(pricing.serviceFee)],
    ['Total de la renta', money(pricing.total)],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-slate-100"><td className="py-1 text-slate-500">{label}</td><td className="py-1 text-right">{value}</td></tr>
        ))}
        <tr className="font-semibold"><td className="py-2">amountDue · lo que el canal paga a Carvi</td><td className="py-2 text-right text-carvi">{money(pricing.amountDue)} {pricing.currency}</td></tr>
      </tbody>
    </table>
  );
}
