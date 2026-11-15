import { useEffect, useState } from 'react';
import { music } from '../audio/synth';
import type { TrackId } from '../audio/score';
import { loadMuted, saveMuted } from '../game/storage';

/**
 * Plays `track` (crossfading on change) and renders a small mute toggle.
 * Audio starts on the first click or key press, as browsers require.
 */
export function MusicToggle({ track }: { track: TrackId }) {
  const [muted, setMuted] = useState(loadMuted);

  useEffect(() => {
    music.setMuted(muted);
    saveMuted(muted);
  }, [muted]);

  useEffect(() => music.play(track), [track]);

  useEffect(() => {
    const unlock = () => music.unlock();
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) setMuted((m) => !m);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <button
      className="music-toggle"
      onClick={() => setMuted((m) => !m)}
      title={`${muted ? 'Unmute' : 'Mute'} music (M)`}
      aria-label={muted ? 'Unmute music' : 'Mute music'}
    >
      {muted ? '🔇' : '🎵'}
    </button>
  );
}
