import { distance, fromKey, key, neighbors, spiral, type Hex } from './hex';
import { mulberry32 } from './rng';
import type { PlayerId, Terrain, Tile } from './types';

export const spawnFor = (player: PlayerId, radius: number): Hex =>
  player === 'p1' ? { q: 0, r: radius - 1 } : { q: 0, r: -(radius - 1) };

/**
 * Generates a point-symmetric board (every hex mirrors to (-q,-r)), so both
 * players always get a fair map. Rock is laid as straight walls with doorways,
 * often in parallel pairs, so the open ground reads as rooms and corridors.
 * Spawns and the centre are kept clear and the open ground is one connected area.
 */
export function generateBoard(seed: number, radius: number): Record<string, Tile> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const tiles = tryGenerate(seed + attempt * 7919, radius);
    if (unclumped(new Set(Object.values(tiles).filter((t) => t.terrain === 'rock').map(key))) && connected(tiles, spawnFor('p1', radius), spawnFor('p2', radius))) return tiles;
  }
  // Fallback: open field.
  return Object.fromEntries(spiral({ q: 0, r: 0 }, radius).map((h) => [key(h), { ...h, terrain: 'plain' as Terrain }]));
}

/** Rock coverage the generator aims for, as a fraction of the board: somewhere in this range. */
export const ROCK_TARGET = { min: 0.2, max: 0.28 };

/** No rock touches more than this many other rocks, so walls stay thin lines and never clump. */
export const MAX_ROCK_NEIGHBOURS = 2;

/** The three hex axes a wall can run along. */
const AXES: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: 1, r: -1 },
];
const mirror = (h: Hex): Hex => ({ q: -h.q + 0, r: -h.r + 0 });

function tryGenerate(seed: number, radius: number): Record<string, Tile> {
  const rand = mulberry32(seed);
  const all = spiral({ q: 0, r: 0 }, radius);
  const spawns = [spawnFor('p1', radius), spawnFor('p2', radius)];
  const onBoard = (h: Hex) => distance(h, { q: 0, r: 0 }) <= radius;
  // Spawns get a clear room, and the centre (the Large crystal's home) a clear crossing.
  const kept = (h: Hex) => spawns.some((s) => distance(s, h) <= 2) || distance(h, { q: 0, r: 0 }) <= 1;
  const placeable = all.filter((h) => !kept(h));
  const int = (n: number) => Math.floor(rand() * n);

  /** A straight wall of rock from `start` along `axis`, with doorways left open, and its mirror image. */
  const wall = (rocks: Set<string>, start: Hex, axis: Hex, length: number) => {
    const hexes: Hex[] = [];
    for (let i = 0; i < length; i++) {
      const h = { q: start.q + axis.q * i, r: start.r + axis.r * i };
      if (!onBoard(h)) break;
      hexes.push(h);
    }
    const doors = new Set<number>();
    if (hexes.length >= 5) doors.add(1 + int(hexes.length - 2));
    if (hexes.length >= 7 && rand() < 0.5) doors.add(1 + int(hexes.length - 2));
    hexes.forEach((h, i) => {
      if (doors.has(i) || kept(h)) return;
      rocks.add(key(h));
      rocks.add(key(mirror(h)));
    });
  };

  const rocks = new Set<string>();
  const target = ROCK_TARGET.min + rand() * (ROCK_TARGET.max - ROCK_TARGET.min);
  for (let tries = 0; tries < 300 && rocks.size / all.length < target; tries++) {
    const trial = new Set(rocks);
    const i = int(AXES.length);
    const start = placeable[int(placeable.length)];
    const length = 3 + int(6);
    wall(trial, start, AXES[i], length);
    if (rand() < 0.5) {
      // A parallel twin 2 or 3 rows over leaves a corridor between the two walls.
      const side = AXES[(i + 1) % AXES.length];
      const gap = 2 + int(2);
      wall(trial, { q: start.q + side.q * gap, r: start.r + side.r * gap }, AXES[i], length);
    }
    // Keep a wall only if all open ground stays one connected area (no sealed-off rooms).
    if (unclumped(trial) && allConnected(trial, all, spawns[0])) for (const k of trial) rocks.add(k);
  }

  // Safety net: seal off any open pocket cut away from the spawns (the loop above should leave none).
  const reachable = flood(rocks, all, spawns[0]);
  for (const h of all) if (!rocks.has(key(h)) && !reachable.has(key(h))) rocks.add(key(h));

  return Object.fromEntries(
    all.map((h) => [key(h), { ...h, terrain: (rocks.has(key(h)) ? 'rock' : 'plain') as Terrain }]),
  );
}

/** True if no rock touches more than MAX_ROCK_NEIGHBOURS others. */
function unclumped(rocks: Set<string>): boolean {
  for (const k of rocks) {
    let touching = 0;
    for (const n of neighbors(fromKey(k))) if (rocks.has(key(n))) touching++;
    if (touching > MAX_ROCK_NEIGHBOURS) return false;
  }
  return true;
}

/** Open hexes reachable from `from` without crossing `rocks`. */
function flood(rocks: Set<string>, all: Hex[], from: Hex): Set<string> {
  const open = new Set(all.map(key));
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighbors(cur)) {
      const k = key(n);
      if (!open.has(k) || rocks.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

const allConnected = (rocks: Set<string>, all: Hex[], from: Hex) =>
  flood(rocks, all, from).size === all.length - rocks.size;

function connected(tiles: Record<string, Tile>, a: Hex, b: Hex): boolean {
  const seen = new Set([key(a)]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    if (key(cur) === key(b)) return true;
    for (const n of neighbors(cur)) {
      const t = tiles[key(n)];
      if (!t || t.terrain === 'rock' || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return false;
}

export const moveCost = (t: Terrain): number => (t === 'rock' ? Infinity : 1);
