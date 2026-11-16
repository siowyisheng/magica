import { spawnFor } from './board';
import { distance, equals, key, type Hex } from './hex';
import { rngStep } from './rng';
import type { Crystal, CrystalState, GameState, Tile } from './types';

// ---------------------------------------------------------------------------
// Mana Crystals: always two on the board (one Large, one Small), cycling
// Spawning → Almost Ready → Ready, one step per round. Placement randomness
// comes from the seeded stream in GameState.rng so replays stay identical.
// ---------------------------------------------------------------------------

const NEXT: Record<CrystalState, CrystalState> = { spawning: 'almostReady', almostReady: 'ready', ready: 'ready' };

export const CRYSTAL_STATE_NAME: Record<CrystalState, string> = {
  spawning: 'Spawning',
  almostReady: 'Almost Ready',
  ready: 'Ready',
};

/** Mana a crystal gives when absorbed in `round` (before Passives and the Mana cap). */
export const crystalYield = (c: Crystal, round: number) => round * (c.size === 'large' ? 2 : 1);

/** A new round: every crystal moves one step along. `onReady` is told about any that just became Ready. */
export function advanceCrystals(state: GameState, onReady?: (c: Crystal) => void) {
  for (const c of state.crystals) {
    const was = c.state;
    c.state = NEXT[c.state];
    if (was !== 'ready' && c.state === 'ready') onReady?.(c);
  }
}

export function initialCrystals(state: GameState): Crystal[] {
  const { radius } = state.config;
  const spawns = [spawnFor('p1', radius), spawnFor('p2', radius)];
  const centre = { q: 0, r: 0 };
  const candidates = openTiles(state.tiles).filter(
    (t) =>
      distance(t, spawns[0]) === distance(t, spawns[1]) &&
      !equals(t, centre) &&
      spawns.every((s) => distance(t, s) >= 2),
  );
  return [
    { size: 'large', pos: centre, state: 'spawning' },
    { size: 'small', pos: pick(state, candidates) ?? { q: 1, r: 0 }, state: 'ready' },
  ];
}

/** Move an absorbed crystal to a fresh Spawning position, roughly equidistant from both mages. */
export function respawnCrystal(state: GameState, crystal: Crystal) {
  const { p1, p2 } = state.mages;
  const other = state.crystals.find((c) => c !== crystal)!;
  const open = openTiles(state.tiles).filter(
    (t) =>
      !equals(t, other.pos) &&
      !equals(t, crystal.pos) &&
      distance(t, p1.pos) >= 2 &&
      distance(t, p2.pos) >= 2,
  );
  const best = Math.min(...open.map((t) => Math.abs(distance(t, p1.pos) - distance(t, p2.pos))));
  const fairest = open.filter((t) => Math.abs(distance(t, p1.pos) - distance(t, p2.pos)) === best);
  crystal.pos = pick(state, fairest) ?? crystal.pos;
  crystal.state = 'spawning';
}

const openTiles = (tiles: Record<string, Tile>): Hex[] =>
  Object.values(tiles)
    .filter((t) => t.terrain === 'plain')
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map(({ q, r }) => ({ q, r }));

function pick(state: GameState, from: Hex[]): Hex | undefined {
  if (!from.length) return undefined;
  const [v, next] = rngStep(state.rng);
  state.rng = next;
  return from[Math.floor(v * from.length)];
}

export const crystalAt = (state: GameState, h: Hex) => state.crystals.find((c) => key(c.pos) === key(h));
