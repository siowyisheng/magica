import { useEffect, useRef } from 'react';
import { newEvents, planSounds, type Viewer } from '../audio/cues';
import { sfx } from '../audio/sfx';
import type { GameState } from '../game/types';

/**
 * Plays sound effects for the events a game state has gained since it last changed. Works the same for
 * live games, AI turns, spectating and replay playback; rewinding or jumping around a replay is silent.
 * `viewer` says whose side the listener is on (see `Viewer`).
 */
export function useSfx(state: GameState, viewer: Viewer) {
  // Events already in the log when the screen opens (the opening turn) are not played.
  const seen = useRef(state.events.length);
  const radius = state.config.radius;
  useEffect(() => {
    const { fresh, seen: now } = newEvents(state.events, seen.current);
    seen.current = now;
    if (fresh.length) sfx.playAll(planSounds(fresh, viewer, radius));
  }, [state.events, viewer, radius]);
}
