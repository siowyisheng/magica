import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { TrackId } from '../audio/score';
import { music } from '../audio/synth';
import { loadSettings, saveSettings, type Settings } from '../game/storage';

// ---------------------------------------------------------------------------
// Player settings: a tiny persisted store shared by the corner controls and
// the settings panel, applied to the music player whenever it changes.
// ---------------------------------------------------------------------------

let current: Settings = loadSettings();
const listeners = new Set<() => void>();

function apply(s: Settings) {
  music.setVolume(s.musicVolume / 100);
  music.setMuted(s.musicMuted);
}
apply(current);

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch, musicVolume: Math.round(Math.max(0, Math.min(100, patch.musicVolume ?? current.musicVolume))) };
  saveSettings(current);
  apply(current);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/**
 * Plays `track` (crossfading on change) and shows the corner buttons: mute and settings.
 * Audio starts on the first click or key press, as browsers require.
 */
export function SettingsControls({ track, onOpen }: { track: TrackId; onOpen: () => void }) {
  const { musicMuted } = useSettings();

  useEffect(() => music.play(track), [track]);

  useEffect(() => {
    const unlock = () => music.unlock();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (e.key.toLowerCase() === 'm') updateSettings({ musicMuted: !current.musicMuted });
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
    <div className="corner-controls">
      <button
        onClick={() => updateSettings({ musicMuted: !musicMuted })}
        title={`${musicMuted ? 'Unmute' : 'Mute'} music (M)`}
        aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
      >
        {musicMuted ? '🔇' : '🎵'}
      </button>
      <button onClick={onOpen} title="Settings" aria-label="Settings">
        ⚙️
      </button>
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const dialog = useRef<HTMLDivElement>(null);

  // While open, the panel owns the keyboard: Esc closes it, and game hotkeys
  // (Space = end turn, 1–8, M, …) don't leak through to the match behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (!dialog.current?.contains(e.target as Node)) e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="overlay settings-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialog}
        className="overlay-card settings-card"
        role="dialog"
        aria-label="Settings"
        onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
      >
        <h2>Settings</h2>

        <section className="setting">
          <label htmlFor="music-volume">Music volume</label>
          <div className="setting-row">
            <span aria-hidden>{s.musicMuted || s.musicVolume === 0 ? '🔇' : s.musicVolume < 50 ? '🔉' : '🔊'}</span>
            <input
              id="music-volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={s.musicVolume}
              onChange={(e) => updateSettings({ musicVolume: Number(e.target.value), musicMuted: false })}
            />
            <span className="setting-value">{s.musicVolume}%</span>
          </div>
        </section>

        <section className="setting">
          <label className="checkbox">
            <input type="checkbox" checked={s.musicMuted} onChange={(e) => updateSettings({ musicMuted: e.target.checked })} />
            Mute music <span className="muted">(M)</span>
          </label>
        </section>

        <div className="row">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
