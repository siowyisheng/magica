import { useEffect, useRef, useState } from 'react';

/**
 * Seconds remaining until `seconds` after `resetKey` last changed.
 * The deadline is reset synchronously during render so a stale "0" never
 * leaks into the first render of a new turn.
 */
export function useCountdown(resetKey: unknown, seconds: number, running: boolean): number {
  const ref = useRef({ key: resetKey, deadline: Date.now() + seconds * 1000 });
  if (ref.current.key !== resetKey) ref.current = { key: resetKey, deadline: Date.now() + seconds * 1000 };
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  return Math.max(0, Math.min(seconds, (ref.current.deadline - now) / 1000));
}
