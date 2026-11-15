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

// v2: Circle-based Loadouts. Older saves (archetypes and relics) are discarded.
const LOADOUTS = 'magica.loadouts.v2';
const REPLAYS = 'magica.replays.v2';
const MAX_REPLAYS = 25;

const DEFAULTS_SEEN = 'magica.defaultsSeen.v2';

/** Saved loadouts, plus any built-in defaults this player hasn't seen yet (e.g. after a content update). */
export function loadLoadouts(): Loadout[] {
  const saved = read<Loadout[] | null>(LOADOUTS, null);
  const seen = new Set(read<string[]>(DEFAULTS_SEEN, saved ? saved.map((l) => l.id) : []));
  const fresh = DEFAULT_LOADOUTS.filter((d) => !seen.has(d.id));
  const merged = [...(saved ?? []), ...fresh];
  if (fresh.length) write(LOADOUTS, merged);
  write(DEFAULTS_SEEN, DEFAULT_LOADOUTS.map((d) => d.id));
  return merged;
}
export const saveLoadouts = (l: Loadout[]) => write(LOADOUTS, l);

export const loadReplays = (): MatchRecord[] => read(REPLAYS, []);
export function saveReplay(rec: MatchRecord) {
  const all = loadReplays().filter((r) => r.id !== rec.id);
  write(REPLAYS, [rec, ...all].slice(0, MAX_REPLAYS));
}

export const newId = () => Math.random().toString(36).slice(2, 10);
