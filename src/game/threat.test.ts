import { describe, expect, it } from 'vitest';
import { generateBoard } from './board';
import { key, type Hex } from './hex';
import { threatArea } from './threat';
import type { Tile } from './types';

function openBoard(): Record<string, Tile> {
  const tiles = generateBoard(1, 6);
  for (const t of Object.values(tiles)) t.terrain = 'plain';
  return tiles;
}
const keys = (hs: Hex[] | null) => (hs ?? []).map(key).sort();
const at = { q: 0, r: 0 };

describe('Line', () => {
  it('runs from next to the caster out to its range, through the aimed hex', () => {
    expect(keys(threatArea(openBoard(), at, { kind: 'line', range: 3 }, { q: 0, r: -1 }))).toEqual(
      ['0,-1', '0,-2', '0,-3'].sort(),
    );
  });

  it('stops at the first Rock', () => {
    const b = openBoard();
    b['0,-2'].terrain = 'rock';
    expect(keys(threatArea(b, at, { kind: 'line', range: 4 }, { q: 0, r: -1 }))).toEqual(['0,-1']);
  });

  it('cannot be aimed at the caster', () => {
    expect(threatArea(openBoard(), at, { kind: 'line', range: 3 }, at)).toBeNull();
  });
});

describe('Single Hex', () => {
  it('is exactly the chosen hex, within range, ignoring Rock', () => {
    const b = openBoard();
    b['0,-1'].terrain = 'rock';
    expect(keys(threatArea(b, at, { kind: 'single', range: 3 }, { q: 0, r: -3 }))).toEqual(['0,-3']);
    expect(threatArea(b, at, { kind: 'single', range: 2 }, { q: 0, r: -3 })).toBeNull();
  });
});

describe('Melee Arc', () => {
  it('is the faced hex plus its two neighbours that also touch the caster', () => {
    expect(keys(threatArea(openBoard(), at, { kind: 'meleeArc' }, { q: 0, r: -1 }))).toEqual(
      ['0,-1', '1,-1', '-1,0'].sort(),
    );
  });

  it('must face an adjacent hex', () => {
    expect(threatArea(openBoard(), at, { kind: 'meleeArc' }, { q: 0, r: -2 })).toBeNull();
  });
});

describe('Burst', () => {
  it('radius 1 covers 7 hexes around the chosen hex, ignoring Rock', () => {
    const b = openBoard();
    b['0,-3'].terrain = 'rock';
    const area = threatArea(b, at, { kind: 'burst', range: 4, radius: 1 }, { q: 0, r: -3 });
    expect(area).toHaveLength(7);
    expect(keys(area)).toContain('0,-3');
  });

  it('is clipped at the arena edge and limited by range', () => {
    expect(threatArea(openBoard(), at, { kind: 'burst', range: 6, radius: 1 }, { q: 0, r: -6 })).toHaveLength(4);
    expect(threatArea(openBoard(), at, { kind: 'burst', range: 2, radius: 1 }, { q: 0, r: -3 })).toBeNull();
  });
});
