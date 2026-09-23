import { useEffect, useRef, useState } from 'react';

/** Subscribes to a server-sent-events URL; the browser reconnects on its own. */
export function useEventSource<T>(url: string, onMessage: (data: T) => void): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });
  useEffect(() => {
    const source = new EventSource(url);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        handler.current(JSON.parse(event.data) as T);
      } catch {
        // ignore malformed frames
      }
    };
    return () => source.close();
  }, [url]);
  return { connected };
}
