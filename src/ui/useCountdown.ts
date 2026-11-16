import { useEffect, useRef, useState } from 'react';

/**
 * Seconds remaining until `seconds` after `resetKey` last changed.
 * The deadline is reset synchronously during render so a stale "0" never
 * leaks into the first render of a new turn.
 *
 * While `paused`, the clock holds still; when it resumes, `resumeBonus` seconds
 * are added (e.g. to give back time spent watching a bid's reveal).
 */
export function useCountdown(resetKey: unknown, seconds: number, running: boolean, paused = false, resumeBonus = 0): number {
  const ref = useRef<{ key: unknown; deadline: number; heldMs: number | null }>({
    key: resetKey,
    deadline: Date.now() + seconds * 1000,
    heldMs: null,
  });
  const clock = ref.current;
  if (clock.key !== resetKey) Object.assign(clock, { key: resetKey, deadline: Date.now() + seconds * 1000, heldMs: null });
  if (paused && clock.heldMs === null) clock.heldMs = Math.max(0, clock.deadline - Date.now());
  if (!paused && clock.heldMs !== null) {
    clock.deadline = Date.now() + clock.heldMs + resumeBonus * 1000;
    clock.heldMs = null;
  }

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || paused) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running, paused]);

  const left = clock.heldMs !== null ? clock.heldMs : clock.deadline - Math.max(now, Date.now() - 100);
  return Math.max(0, left / 1000);
}
