import type { ReactNode } from 'react';
import { CarviApiError } from '../api/client';
import { guidanceFor } from '../lib/guidance';
import { cn } from './ui';

interface Props {
  error: unknown;
  /** Replaces the generic guidance for the error code when the context knows better. */
  hint?: string | null;
  className?: string;
  children?: ReactNode;
}

/** Inline error from Carvi with the guidance for its code; details stay in the technical panel. */
export function ApiErrorBox({ error, hint, className, children }: Props) {
  const apiError = error instanceof CarviApiError ? error : null;
  const guidance = hint ?? (apiError ? guidanceFor(apiError.code) : null);
  const field = apiError?.code === 'CLIENT_DATA_CONFLICT' ? (apiError.details as { field?: string } | null)?.field : undefined;
  return (
    <div className={cn('rounded-md bg-red-50 p-3 text-sm text-red-800', className)}>
      <div className="font-medium">{apiError ? apiError.message : error instanceof Error ? error.message : String(error)}</div>
      {guidance && <div className="mt-1">{guidance}</div>}
      {field && <div className="mt-1">Dato en conflicto: <code>{field}</code></div>}
      {apiError && <div className="mt-1 font-mono text-xs text-red-500">{apiError.code}{apiError.status ? ` · HTTP ${apiError.status}` : ''}</div>}
      {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
