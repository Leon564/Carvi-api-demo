import { cn } from './ui';

const typeLabel = (value: unknown): string | null => (typeof value === 'number' ? 'número' : typeof value === 'boolean' ? 'sí/no' : null);

/** Key/value view of a booking's `metadata`; accepts unknown values because webhook payloads are untyped. */
export function MetadataTable({ metadata, className }: { metadata: Record<string, unknown> | null | undefined; className?: string }) {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) return <p className={cn('text-sm text-slate-500', className)}>Sin datos adicionales</p>;
  return (
    <table className={cn('w-full text-sm', className)}>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-slate-100 last:border-0">
            <td className="py-1 pr-3 align-top font-mono text-xs text-slate-500">{key}</td>
            <td className="break-all py-1">
              {typeof value === 'string' ? value : JSON.stringify(value)}
              {typeLabel(value) && <span className="ml-2 text-xs text-slate-400">{typeLabel(value)}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
