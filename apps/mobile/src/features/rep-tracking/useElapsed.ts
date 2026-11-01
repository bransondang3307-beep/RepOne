import { useEffect, useState } from 'react';

/** "m:ss" since `startedAtMs`, ticking once a second while `running`; frozen when it stops. */
export function useElapsed(startedAtMs: number | null, running: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return formatElapsed(startedAtMs === null ? 0 : now - startedAtMs);
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
