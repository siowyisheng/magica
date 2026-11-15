import { distance, key, neighbors, spiral, type Hex } from './hex';
import { mulberry32 } from './rng';
import type { PlayerId, Terrain, Tile } from './types';

export const spawnFor = (player: PlayerId, radius: number): Hex =>
  player === 'p1' ? { q: 0, r: radius - 1 } : { q: 0, r: -(radius - 1) };

/**
 * Generates a point-symmetric board (every hex mirrors to (-q,-r)), so both
 * players always get a fair map. Spawns are kept clear and guaranteed connected.
 */
export function generateBoard(seed: number, radius: number): Record<string, Tile> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const tiles = tryGenerate(seed + attempt * 7919, radius);
    if (connected(tiles, spawnFor('p1', radius), spawnFor('p2', radius))) return tiles;
  }
  // Fallback: open field.
  return Object.fromEntries(spiral({ q: 0, r: 0 }, radius).map((h) => [key(h), { ...h, terrain: 'plain' as Terrain }]));
}

/** Applied to hexes outside the spawn zones, so overall coverage lands near 18%. */
const ROCK_CHANCE = 0.2;

function tryGenerate(seed: number, radius: number): Record<string, Tile> {
  const rand = mulberry32(seed);
  const tiles: Record<string, Tile> = {};
  const spawns = [spawnFor('p1', radius), spawnFor('p2', radius)];
  const nearSpawn = (h: Hex) => spawns.some((s) => distance(s, h) <= 1);

  for (const h of spiral({ q: 0, r: 0 }, radius)) {
    const canonical = h.q > 0 || (h.q === 0 && h.r > 0);
    if (!canonical) continue;
    let terrain: Terrain = 'plain';
    if (!nearSpawn(h)) {
      if (rand() < ROCK_CHANCE) terrain = 'rock';
    }
    tiles[key(h)] = { ...h, terrain };
    const mirror = { q: -h.q + 0, r: -h.r + 0 };
    tiles[key(mirror)] = { ...mirror, terrain };
  }
  tiles[key({ q: 0, r: 0 })] = { q: 0, r: 0, terrain: 'plain' }; // the Large crystal's home
  return tiles;
}

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
