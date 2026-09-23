import type { PageMeta } from '../api/types';
import { Button } from './ui';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>Página {meta.page} de {Math.max(meta.totalPages, 1)} · {meta.total} en total</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Anterior</Button>
        <Button variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}
