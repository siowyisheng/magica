import { distance, hexRound, key, neighbors, spiral, type Hex } from './hex';
import type { Shape, Tile } from './types';

// ---------------------------------------------------------------------------
// Threat Area geometry. Pure functions of the board, the caster's hex, the
// Shape and the aimed hex. Returns null when the aim is invalid for the Shape.
// ---------------------------------------------------------------------------

type Tiles = Record<string, Tile>;

/**
 * Hexes stepped from `from` toward `aim`, one hex of distance per step, for
 * `steps` steps (not including `from`). Works for any direction, not just the six axes.
 */
export function ray(from: Hex, aim: Hex, steps: number): Hex[] {
  const d = distance(from, aim);
  if (d === 0) return [];
  const dq = (aim.q - from.q) / d;
  const dr = (aim.r - from.r) / d;
  const out: Hex[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= steps; i++) {
    const h = hexRound(from.q + dq * i + 1e-6, from.r + dr * i + 1e-6);
    if (!seen.has(key(h))) {
      seen.add(key(h));
      out.push(h);
    }
  }
  return out;
}

/** A Line: from next to the caster out to `range`, stopping before the first Rock or the arena edge. */
function lineHexes(tiles: Tiles, from: Hex, aim: Hex, range: number): Hex[] {
  const out: Hex[] = [];
  for (const h of ray(from, aim, range)) {
    const t = tiles[key(h)];
    if (!t || t.terrain === 'rock') break;
    out.push(h);
  }
  return out;
}

const onBoard = (tiles: Tiles, hs: Hex[]) => hs.filter((h) => tiles[key(h)]);

export function threatArea(tiles: Tiles, caster: Hex, shape: Shape, aim: Hex): Hex[] | null {
  if (!tiles[key(aim)]) return null;
  const d = distance(caster, aim);
  switch (shape.kind) {
    case 'line':
      return d === 0 ? null : lineHexes(tiles, caster, aim, shape.range);
    case 'single':
      return d === 0 || d > shape.range ? null : [aim];
    case 'meleeArc':
      return d !== 1 ? null : onBoard(tiles, [aim, ...neighbors(aim).filter((n) => distance(n, caster) === 1)]);
    case 'burst':
      return d > shape.range ? null : onBoard(tiles, spiral(aim, shape.radius));
  }
}

/** Every hex the caster could aim this Shape at (for targeting UI and the AI). */
export function aimableHexes(tiles: Tiles, caster: Hex, shape: Shape): Hex[] {
  return Object.values(tiles).filter((t) => {
    const d = distance(caster, t);
    switch (shape.kind) {
      case 'line':
        return d >= 1 && d <= shape.range;
      case 'single':
        return d >= 1 && d <= shape.range;
      case 'meleeArc':
        return d === 1;
      case 'burst':
        return d <= shape.range;
    }
  });
}

export const SHAPE_NAME: Record<Shape['kind'], string> = {
  line: 'Line',
  single: 'Single Hex',
  meleeArc: 'Melee Arc',
  burst: 'Burst',
};
