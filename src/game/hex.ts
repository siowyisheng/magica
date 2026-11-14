// Axial hex coordinates (pointy-top). See https://www.redblobgames.com/grids/hexagons/
export interface Hex {
  q: number;
  r: number;
}

export const key = (h: Hex): string => `${h.q},${h.r}`;

export const fromKey = (k: string): Hex => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

export const equals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map((d) => add(h, d));

export const distance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

export function hexRound(fq: number, fr: number): Hex {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 }; // + 0 normalises -0
}

/** Every hex on the straight line from a to b, inclusive. */
export function line(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  if (n === 0) return [a];
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6));
  }
  return out;
}

/** All hexes within `radius` of `center`. */
export function spiral(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push(add(center, { q, r }));
  }
  return out;
}

const SQRT3 = Math.sqrt(3);

export const toPixel = (h: Hex, size: number) => ({
  x: size * SQRT3 * (h.q + h.r / 2),
  y: size * 1.5 * h.r,
});

/** SVG polygon points for a pointy-top hex centred on the origin. */
export function hexPoints(size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(size * Math.cos(a)).toFixed(2)},${(size * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
