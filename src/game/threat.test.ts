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

describe('Explosive Line', () => {
  const fireball = { kind: 'explosiveLine', range: 99, radius: 1 } as const;

  it('flies to the aimed hex and bursts there', () => {
    const area = threatArea(openBoard(), at, fireball, { q: 0, r: -3 });
    expect(area).toHaveLength(8); // 3 flight hexes + 7 burst hexes, 2 shared
    expect(keys(area)).toContain('1,-4');
    expect(keys(area)).not.toContain('0,-5');
  });

  it('bursts at the hex before a Rock', () => {
    const b = openBoard();
    b['0,-3'].terrain = 'rock';
    const area = keys(threatArea(b, at, fireball, { q: 0, r: -5 }));
    expect(area).toContain('1,-3'); // a neighbour of (0,-2)
    expect(area).not.toContain('0,-4');
  });

  it('bursts on the enemy if it reaches them before the aimed hex, and also at the aimed hex in case they move', () => {
    const area = keys(threatArea(openBoard(), at, fireball, { q: 0, r: -5 }, { q: 0, r: -2 }));
    expect(area).toContain('1,-3'); // burst around the enemy at (0,-2)
    expect(area).toContain('1,-5'); // burst around the aimed hex
    expect(area).not.toContain('2,-3');
  });

  it('aimed past a Rock, flies only as far as the Rock whether or not the enemy is in the way', () => {
    const b = openBoard();
    b['0,-4'].terrain = 'rock';
    const area = keys(threatArea(b, at, fireball, { q: 0, r: -6 }, { q: 0, r: -2 }));
    expect(area).toContain('0,-3');
    expect(area).not.toContain('0,-5');
  });

  it('cannot be aimed straight into adjacent Rock, or past its range', () => {
    const b = openBoard();
    b['0,-1'].terrain = 'rock';
    expect(threatArea(b, at, fireball, { q: 0, r: -4 })).toBeNull();
    expect(threatArea(openBoard(), at, { kind: 'explosiveLine', range: 3, radius: 1 }, { q: 0, r: -4 })).toBeNull();
  });
});

describe('Single Hex with line of sight', () => {
  it('cannot be aimed through Rock, but a plain Single Hex can', () => {
    const b = openBoard();
    b['0,-2'].terrain = 'rock';
    expect(threatArea(b, at, { kind: 'single', range: 7, los: true }, { q: 0, r: -4 })).toBeNull();
    expect(threatArea(b, at, { kind: 'single', range: 7 }, { q: 0, r: -4 })).toHaveLength(1);
    expect(threatArea(b, at, { kind: 'single', range: 7, los: true }, { q: 1, r: -4 })).toHaveLength(1);
  });

  it('is limited to its range', () => {
    expect(threatArea(openBoard(), at, { kind: 'single', range: 6, los: true }, { q: 0, r: -6 })).toHaveLength(1);
    expect(threatArea(openBoard(), at, { kind: 'single', range: 3, los: true }, { q: 0, r: -4 })).toBeNull();
  });
});

describe('Cone', () => {
  it('is a 60° wedge: 1 + 3 + 3 hexes out to range 3', () => {
    expect(threatArea(openBoard(), at, { kind: 'cone', range: 2 }, { q: 0, r: -1 })).toHaveLength(4);
    expect(threatArea(openBoard(), at, { kind: 'cone', range: 3 }, { q: 0, r: -1 })).toHaveLength(7);
  });
});

describe('Fan', () => {
  it('is three Lines inside the matching Cone, with gaps between them', () => {
    const fan = keys(threatArea(openBoard(), at, { kind: 'fan', range: 4 }, { q: 0, r: -1 }));
    const cone = keys(threatArea(openBoard(), at, { kind: 'cone', range: 4 }, { q: 0, r: -1 }));
    for (const k of fan) expect(cone).toContain(k);
    expect(fan.length).toBeLessThan(cone.length);
    for (const k of ['0,-1', '0,-2', '0,-3', '0,-4']) expect(fan).toContain(k); // middle prong
  });

  it('a Rock stops only the prong it is on', () => {
    const b = openBoard();
    b['0,-2'].terrain = 'rock';
    const fan = keys(threatArea(b, at, { kind: 'fan', range: 4 }, { q: 0, r: -1 }));
    expect(fan).toContain('0,-1');
    expect(fan).not.toContain('0,-3');
    expect(fan.length).toBeGreaterThan(4);
  });
});

describe('bigger Bursts and Self-Burst', () => {
  it('radius 2, 3 and 4 cover 19, 37 and 61 hexes', () => {
    for (const [radius, n] of [[2, 19], [3, 37], [4, 61]])
      expect(threatArea(openBoard(), at, { kind: 'burst', range: 6, radius }, at)).toHaveLength(n);
  });

  it('Self-Burst is centred on the caster, leaves out the caster’s own hex, and can only be aimed there', () => {
    const area = threatArea(openBoard(), at, { kind: 'selfBurst', radius: 2 }, at);
    expect(area).toHaveLength(18);
    expect(keys(area)).not.toContain('0,0');
    expect(threatArea(openBoard(), at, { kind: 'selfBurst', radius: 2 }, { q: 0, r: -1 })).toBeNull();
  });
});

describe('Wall', () => {
  const wall = { kind: 'wall', range: 3, length: 5 } as const;
  const path = (...hs: Array<[number, number]>) => hs.map(([q, r]) => ({ q, r }));

  it('is any path of 5 connected hexes, straight or bent', () => {
    expect(threatArea(openBoard(), at, wall, path([0, -2], [1, -2], [2, -2], [3, -2], [4, -2]))).toHaveLength(5);
    expect(threatArea(openBoard(), at, wall, path([0, -2], [1, -2], [1, -1], [1, 0], [0, 1]))).toHaveLength(5);
  });

  it('rejects broken, repeating, rocky, too-short or out-of-range paths', () => {
    const b = openBoard();
    b['2,-2'].terrain = 'rock';
    expect(threatArea(openBoard(), at, wall, path([0, -2], [2, -2], [3, -2], [4, -2], [5, -2]))).toBeNull();
    expect(threatArea(openBoard(), at, wall, path([0, -2], [1, -2], [0, -2], [1, -2], [2, -2]))).toBeNull();
    expect(threatArea(b, at, wall, path([0, -2], [1, -2], [2, -2], [3, -2], [4, -2]))).toBeNull();
    expect(threatArea(openBoard(), at, wall, path([0, -2], [1, -2], [2, -2]))).toBeNull();
    expect(threatArea(openBoard(), at, wall, path([0, -4], [1, -4], [2, -4], [3, -4], [4, -4]))).toBeNull();
  });
});

describe('AI with every shape', () => {
  it('aims each shape at the enemy, and dodges it', async () => {
    const { createGame, applyAction } = await import('./engine');
    const { chooseAction } = await import('./ai');
    for (const id of ['fireball', 'dragons-breath', 'ice-shards', 'nova', 'wall-of-fire', 'meteor']) {
      const l = { id, name: id, circle: 1 as const, stats: { hp: 3, maxMana: 0, manaRegen: 0, movespeed: 3 }, weapon: 'unarmed' as const, abilityIds: [id, 'blink'], passiveIds: [] };
      let g = createGame({ seed: 9, radius: 6, turnSeconds: 20, maxTurns: 60, loadouts: { p1: l, p2: l }, names: { p1: 'A', p2: 'B' } });
      for (const t of Object.values(g.tiles)) t.terrain = 'plain';
      g.crystals = [];
      g.mages.p1.mana = g.mages.p2.mana = 30;
      g.mages.p1.pos = { q: 0, r: 1 };
      g.mages.p2.pos = id === 'nova' ? { q: 0, r: -1 } : { q: 0, r: -2 };
      const a = chooseAction(g, 'p1');
      expect(a, id).toMatchObject({ type: 'cast', abilityId: id });
      g = applyAction(g, a);
      expect(g.pending[0].area, id).toContain(`${g.mages.p2.pos.q},${g.mages.p2.pos.r}`);
      // Hand over to P2, who should step out of the area.
      while (g.active === 'p1') g = applyAction(g, chooseAction(g, 'p1'));
      while (g.phase === 'reaction') g = applyAction(g, chooseAction(g, 'p2'));
      expect(g.mages.p2.hp, id).toBe(g.mages.p2.maxHp);
    }
  });
});
