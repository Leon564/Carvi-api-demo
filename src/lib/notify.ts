import { toast } from 'sonner';
import { CarviApiError } from '../api/client';
import { guidanceFor } from './guidance';

export function notifyError(err: unknown): void {
  if (err instanceof CarviApiError) {
    toast.error(`${err.code} · ${err.message}`, {
      description: guidanceFor(err.code) ?? (err.details ? JSON.stringify(err.details) : undefined),
    });
    return;
  }
  toast.error(err instanceof Error ? err.message : 'Error inesperado');
}
