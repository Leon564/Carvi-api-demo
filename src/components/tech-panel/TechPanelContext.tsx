import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { local } from '../../api/client';
import { useEventSource } from '../../lib/sse';

export interface Exchange {
  id: string;
  at: string;
  method: string;
  path: string;
  query: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

interface TechPanelState {
  exchanges: Exchange[];
  open: boolean;
  setOpen: (open: boolean) => void;
  clear: () => void;
  connected: boolean;
}

const TechPanelContext = createContext<TechPanelState | null>(null);
const MAX = 200;

export function TechPanelProvider({ children }: { children: ReactNode }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Merge instead of replacing: exchanges already pushed over SSE while this GET was in flight must not be lost.
    local
      .get<Exchange[]>('/log')
      .then((res) => {
        setExchanges((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          return [...prev, ...res.data.filter((e) => !seen.has(e.id))].slice(0, MAX);
        });
      })
      .catch(() => undefined);
  }, []);

  const { connected } = useEventSource<Exchange>('/api/log/stream', (exchange) => {
    setExchanges((prev) => [exchange, ...prev].slice(0, MAX));
    // Contract errors open the panel so nobody has to hunt for them.
    if (exchange.status >= 400 || exchange.status === 0) setOpen(true);
  });

  const clear = useCallback(() => setExchanges([]), []);
  const value = useMemo(() => ({ exchanges, open, setOpen, clear, connected }), [exchanges, open, clear, connected]);
  return <TechPanelContext.Provider value={value}>{children}</TechPanelContext.Provider>;
}

export function useTechPanel(): TechPanelState {
  const ctx = useContext(TechPanelContext);
  if (!ctx) throw new Error('useTechPanel must be used inside TechPanelProvider');
  return ctx;
}
