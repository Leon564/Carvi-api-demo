import { useEffect, useState } from 'react';

export interface Countdown {
  secondsLeft: number;
  expired: boolean;
  /** Seconds elapsed since the target passed (0 while not expired). */
  secondsSinceExpiry: number;
}

export function useCountdown(targetIso: string | null | undefined): Countdown {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return { secondsLeft: 0, expired: false, secondsSinceExpiry: 0 };
  const diff = Math.floor((new Date(targetIso).getTime() - now) / 1000);
  return { secondsLeft: Math.max(0, diff), expired: diff <= 0, secondsSinceExpiry: diff <= 0 ? -diff : 0 };
}

export const mmss = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
