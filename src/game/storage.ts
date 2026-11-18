import { DEFAULT_LOADOUTS, DEFAULT_MAGE_ICON, PASSIVES } from './content';
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

// v3: Circle-based Loadouts with the delayed-Attack catalogue. Older saves are discarded.
const LOADOUTS = 'magica.loadouts.v3';
// v5: weapons arrived (v4: Magic split into Max Mana and Mana Regen), so older replays no longer play out the same.
const REPLAYS = 'magica.replays.v5';
const MAX_REPLAYS = 25;

const DEFAULTS_SEEN = 'magica.defaultsSeen.v3';

/**
 * Loadouts saved before weapons existed all had Staff Strike for free. A Spear Thrust becomes a Spear (whose
 * Thrust comes with it), and anything else goes Unarmed with no technique, so nothing ends up over budget.
 */
function migrateWeapon(l: Loadout): Loadout {
  if ((l as Partial<Loadout>).weapon) return l;
  const spear = l.abilityIds.includes('spear-thrust');
  return { ...l, weapon: spear ? 'spear' : 'unarmed', abilityIds: l.abilityIds.filter((id) => id !== 'staff-strike' && id !== 'spear-thrust') };
}

/** Loadouts saved before mage icons get their default's icon (or the standard one). */
const migrateIcon = (l: Loadout): Loadout =>
  l.icon ? l : { ...l, icon: DEFAULT_LOADOUTS.find((d) => d.id === l.id)?.icon ?? DEFAULT_MAGE_ICON };

/** Abilities that no longer exist; saved loadouts drop them. */
const REMOVED_ABILITIES = new Set([
  'shield-bash', 'cataclysm', 'tidal-wave', 'channel-mana', 'ice-shards', 'wall-of-fire', 'plague', 'riptide', 'mend', 'haste', 'empower',
  'stone-pillar', 'blink', 'deflect', 'counterspell',
]);
const dropRemoved = (l: Loadout): Loadout => ({
  ...l,
  abilityIds: l.abilityIds.filter((id) => !REMOVED_ABILITIES.has(id)),
  passiveIds: l.passiveIds.filter((id) => PASSIVES[id]), // every Passive was removed; any that return keep working
});

/** Loadouts saved before Magic split into Max Mana and Mana Regen: the old Magic steps become Mana Regen steps. */
function migrateStats(l: Loadout): Loadout {
  const s = l.stats as Partial<Record<string, number>>;
  return { ...l, stats: { hp: s.hp ?? 0, maxMana: s.maxMana ?? 0, manaRegen: s.manaRegen ?? s.magic ?? 0, movespeed: s.movespeed ?? 0 } };
}

/** Saved loadouts, plus any built-in defaults this player hasn't seen yet (e.g. after a content update). */
export function loadLoadouts(): Loadout[] {
  const saved = read<Loadout[] | null>(LOADOUTS, null)?.map(migrateStats).map(migrateWeapon).map(dropRemoved).map(migrateIcon) ?? null;
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

export interface Settings {
  /** Music volume, 0–100. */
  musicVolume: number;
  musicMuted: boolean;
  /** Sound effects volume, 0–100. */
  sfxVolume: number;
  sfxMuted: boolean;
}

const SETTINGS = 'magica.settings.v1';
export const DEFAULT_SETTINGS: Settings = { musicVolume: 55, musicMuted: false, sfxVolume: 70, sfxMuted: false };
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS, {}) });
export const saveSettings = (s: Settings) => write(SETTINGS, s);

/** Match options the Setup screen remembers between duels. */
export interface SetupPrefs {
  /** The Free Movement Rules variant. */
  freeMovement: boolean;
}
const SETUP = 'magica.setup.v1';
export const loadSetupPrefs = (): SetupPrefs => ({ freeMovement: false, ...read<Partial<SetupPrefs>>(SETUP, {}) });
export const saveSetupPrefs = (p: SetupPrefs) => write(SETUP, p);
