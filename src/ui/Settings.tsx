import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { TrackId } from '../audio/score';
import type { Sound } from '../audio/cues';
import { sfx } from '../audio/sfx';
import { music } from '../audio/synth';
import { ABILITIES } from '../game/content';
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
  sfx.setVolume(s.sfxVolume / 100);
  sfx.setMuted(s.sfxMuted);
}
apply(current);

export function updateSettings(patch: Partial<Settings>) {
  const level = (n: number) => Math.round(Math.max(0, Math.min(100, n)));
  current = {
    ...current,
    ...patch,
    musicVolume: level(patch.musicVolume ?? current.musicVolume),
    sfxVolume: level(patch.sfxVolume ?? current.sfxVolume),
  };
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

        <section className="setting">
          <label htmlFor="sfx-volume">Sound effects volume</label>
          <div className="setting-row">
            <span aria-hidden>{s.sfxMuted || s.sfxVolume === 0 ? '🔇' : s.sfxVolume < 50 ? '🔉' : '🔊'}</span>
            <input
              id="sfx-volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={s.sfxVolume}
              onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value), sfxMuted: false })}
              onPointerUp={() => sfx.play({ id: 'confirm' })}
            />
            <span className="setting-value">{s.sfxVolume}%</span>
          </div>
        </section>

        <section className="setting">
          <label className="checkbox">
            <input type="checkbox" checked={s.sfxMuted} onChange={(e) => updateSettings({ sfxMuted: e.target.checked })} />
            Mute sound effects
          </label>
        </section>

        <SoundTest />

        <div className="row">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Every sound in the game, to audition and tune. Its buttons are silent apart from the sound they play. */
function SoundTest() {
  const play = (sound: Sound) => {
    music.unlock();
    sfx.play(sound);
  };
  const game: Array<[string, Sound]> = [
    ['Damage (small)', { id: 'damage', amount: 2 }],
    ['Damage (big)', { id: 'damage', amount: 10 }],
    ['Absorbed', { id: 'absorbed' }],
    ['Footstep', { id: 'step' }],
    ['Crystal absorbed (small)', { id: 'crystalAbsorb', size: 'small' }],
    ['Crystal absorbed (large)', { id: 'crystalAbsorb', size: 'large' }],
    ['Crystal ready', { id: 'crystalReady' }],
    ['Your Action Phase', { id: 'actionStart' }],
    ['Reaction alert', { id: 'reactionStart' }],
    ['Victory', { id: 'win' }],
    ['Defeat', { id: 'lose' }],
    ['Neutral fanfare', { id: 'fanfare' }],
    ['Button click', { id: 'click' }],
    ['Confirm', { id: 'confirm' }],
    ['Ability select', { id: 'select' }],
  ];
  return (
    <details className="setting sound-test" data-silent>
      <summary>Sound test</summary>
      <div className="sound-test-list">
        <h3>Game</h3>
        <div className="sound-test-row">
          {game.map(([name, sound]) => (
            <button key={name} onClick={() => play(sound)}>
              {name}
            </button>
          ))}
        </div>
        <h3>Abilities</h3>
        {Object.values(ABILITIES).map((def) => (
          <div key={def.id} className="sound-test-row">
            <span className="sound-test-name">
              {def.icon} {def.name}
            </span>
            {def.effect.type === 'attack' ? (
              <>
                <button onClick={() => play({ id: 'launch', abilityId: def.id })}>Launch</button>
                <button onClick={() => play({ id: 'resolve', abilityId: def.id })}>Lands</button>
              </>
            ) : (
              <button onClick={() => play({ id: 'cast', abilityId: def.id })}>Cast</button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
