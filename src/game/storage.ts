import { DEFAULT_LOADOUTS } from './content';
import type { Loadout, MatchRecord } from './types';

// Thin localStorage wrapper. Swap for a file-backed store when packaged
// for desktop (Electron: app.getPath('userData')).

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable or full — non-fatal */
  }
}

const LOADOUTS = 'magica.loadouts.v1';
const REPLAYS = 'magica.replays.v1';
const MAX_REPLAYS = 25;

export const loadLoadouts = (): Loadout[] => read(LOADOUTS, DEFAULT_LOADOUTS);
export const saveLoadouts = (l: Loadout[]) => write(LOADOUTS, l);

export const loadReplays = (): MatchRecord[] => read(REPLAYS, []);
export function saveReplay(rec: MatchRecord) {
  const all = loadReplays().filter((r) => r.id !== rec.id);
  write(REPLAYS, [rec, ...all].slice(0, MAX_REPLAYS));
}

export const newId = () => Math.random().toString(36).slice(2, 10);
