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

const SQRT3 = Math.sqrt(3);
const pixel = (h: Hex) => ({ x: SQRT3 * (h.q + h.r / 2), y: 1.5 * h.r });
const angleTo = (from: Hex, to: Hex) => {
  const a = pixel(from);
  const b = pixel(to);
  return Math.atan2(b.y - a.y, b.x - a.x);
};
const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const EPS = 1e-6;

/** Hexes along a straight ray at `angle` from `from`, out to hex distance `range`, stopping at Rock or the edge. */
function angledLine(tiles: Tiles, from: Hex, angle: number, range: number): Hex[] {
  const o = pixel(from);
  const out: Hex[] = [];
  const seen = new Set([key(from)]);
  for (let t = 0.25; ; t += 0.25) {
    const x = o.x + Math.cos(angle) * t;
    const y = o.y + Math.sin(angle) * t;
    // Pixel → fractional axial for pointy-top hexes of size 1, nudged off exact edges.
    const h = hexRound((SQRT3 / 3) * x - y / 3 + 1e-6, (2 / 3) * y + 2e-6);
    if (seen.has(key(h))) continue;
    if (distance(from, h) > range) break;
    const tile = tiles[key(h)];
    if (!tile || tile.terrain === 'rock') break;
    seen.add(key(h));
    out.push(h);
  }
  return out;
}

const union = (...lists: Hex[][]) => [...new Map(lists.flat().map((h) => [key(h), h])).values()];

function wallPath(tiles: Tiles, caster: Hex, shape: Extract<Shape, { kind: 'wall' }>, path: Hex[]): Hex[] | null {
  if (path.length !== shape.length) return null;
  if (distance(caster, path[0]) > shape.range) return null;
  const seen = new Set<string>();
  for (let i = 0; i < path.length; i++) {
    const t = tiles[key(path[i])];
    if (!t || t.terrain === 'rock' || seen.has(key(path[i]))) return null;
    if (i > 0 && distance(path[i - 1], path[i]) !== 1) return null;
    seen.add(key(path[i]));
  }
  return path.map(({ q, r }) => ({ q, r }));
}

/** Threat Area for `shape` cast from `caster`. `aim` is a hex, or the drawn path for a Wall. Null = invalid aim. */
export function threatArea(tiles: Tiles, caster: Hex, shape: Shape, aimOrPath: Hex | Hex[]): Hex[] | null {
  if (isDrawn(shape)) return Array.isArray(aimOrPath) ? wallPath(tiles, caster, shape, aimOrPath) : null;
  if (Array.isArray(aimOrPath)) return null;
  const aim = aimOrPath;
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
    case 'explosiveLine': {
      if (d === 0) return null;
      const path = lineHexes(tiles, caster, aim, shape.range);
      const centre = path[path.length - 1] ?? caster;
      return union(path, onBoard(tiles, spiral(centre, shape.radius)));
    }
    case 'cone': {
      if (d === 0) return null;
      const dir = angleTo(caster, aim);
      return spiral(caster, shape.range).filter(
        (h) => tiles[key(h)] && distance(caster, h) >= 1 && angleDiff(angleTo(caster, h), dir) <= Math.PI / 6 + EPS,
      );
    }
    case 'fan': {
      if (d === 0) return null;
      const dir = angleTo(caster, aim);
      // Side prongs run along corner directions; tilt them a hair inward so ties stay inside the wedge.
      const side = Math.PI / 6 - 0.01;
      return union(...[-1, 0, 1].map((k) => angledLine(tiles, caster, dir + k * side, shape.range)));
    }
    case 'selfBurst':
      return d !== 0 ? null : onBoard(tiles, spiral(caster, shape.radius));
  }
}

/** Every hex the caster could aim this Shape at (for targeting UI and the AI). */
export function aimableHexes(tiles: Tiles, caster: Hex, shape: Shape): Hex[] {
  return Object.values(tiles).filter((t) => {
    const d = distance(caster, t);
    switch (shape.kind) {
      case 'line':
      case 'single':
      case 'explosiveLine':
      case 'cone':
      case 'fan':
        return d >= 1 && d <= shape.range;
      case 'meleeArc':
        return d === 1;
      case 'burst':
        return d <= shape.range;
      case 'selfBurst':
        return d === 0;
      case 'wall':
        return d <= shape.range && t.terrain !== 'rock'; // where the first hex may go
    }
  });
}

/** True for shapes the caster draws hex by hex (aimed with a path rather than one hex). */
export const isDrawn = (shape: Shape): shape is Extract<Shape, { kind: 'wall' }> => shape.kind === 'wall';

/** Furthest hex (from the caster) a shape can threaten. */
export function shapeReach(shape: Shape): number {
  switch (shape.kind) {
    case 'meleeArc':
      return 1;
    case 'selfBurst':
      return shape.radius;
    case 'burst':
    case 'explosiveLine':
      return shape.range + shape.radius;
    case 'wall':
      return shape.range + shape.length - 1;
    default:
      return shape.range;
  }
}

export const SHAPE_NAME: Record<Shape['kind'], string> = {
  line: 'Line',
  single: 'Single Hex',
  meleeArc: 'Melee Arc',
  burst: 'Burst',
  explosiveLine: 'Explosive Line',
  cone: 'Cone',
  fan: 'Fan',
  selfBurst: 'Self-Burst',
  wall: 'Wall',
};
