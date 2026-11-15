import { describe, expect, it } from 'vitest';
import { ABILITIES } from './content';
import { apCost, applyAction, castError, createGame, reachable } from './engine';
import type { Hex } from './hex';
import type { GameState, Loadout } from './types';

const loadout = (abilities: string[] = [], movespeed = 0): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, magic: 0, movespeed },
  abilityIds: ['staff-strike', ...abilities],
  passiveIds: [],
});

/** Open board, P1 at the bottom, P2 far away at the top. */
function duel(abilities: string[] = [], movespeed = 0): GameState {
  const g = createGame({
    seed: 1,
    radius: 6,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(abilities, movespeed), p2: loadout() },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.mages.p1.pos = { q: 0, r: 5 };
  g.mages.p2.pos = { q: 0, r: -5 };
  g.mages.p1.mana = 99;
  return g;
}

const move = (g: GameState, to: Hex) => applyAction(g, { type: 'move', player: 'p1', to });

describe('AP and Movement Points', () => {
  it('each turn starts with 2 AP and no Movement Points', () => {
    const g = duel();
    expect(g.mages.p1.ap).toBe(2);
    expect(g.mages.p1.mp).toBe(0);
  });

  it('the first Move spends 1 AP for Movement Points equal to Movespeed', () => {
    const g = move(duel(), { q: 0, r: 4 });
    expect(g.mages.p1.ap).toBe(1);
    expect(g.mages.p1.mp).toBe(2);
    const g2 = move(g, { q: 0, r: 2 }); // uses the remaining 2 points, no AP
    expect(g2.mages.p1.ap).toBe(1);
    expect(g2.mages.p1.mp).toBe(0);
  });

  it('a second AP buys another batch once points run out', () => {
    const g = move(duel(), { q: 0, r: 0 }); // 5 hexes: 2 AP, 6 points
    expect(g.mages.p1.ap).toBe(0);
    expect(g.mages.p1.mp).toBe(1);
  });

  it('cannot reach further than 2 × Movespeed in a turn', () => {
    const r = reachable(duel(), 'p1');
    expect(Math.max(...r.values())).toBe(6);
    expect(move(duel(), { q: 0, r: -2 }).mages.p1.pos).toEqual({ q: 0, r: 5 }); // 7 away: rejected
    expect(Math.max(...reachable(duel([], 1), 'p1').values())).toBe(8);
  });

  it('unspent Movement Points expire at end of turn', () => {
    let g = move(duel(), { q: 0, r: 4 });
    g = applyAction(g, { type: 'endTurn', player: 'p1' });
    g = applyAction(g, { type: 'endTurn', player: 'p2' });
    expect(g.mages.p1.mp).toBe(0);
    expect(g.mages.p1.ap).toBe(2);
  });

  it('slow shrinks each batch; root stops buying any', () => {
    const slowed = duel();
    slowed.mages.p1.statuses = [{ kind: 'slow', turns: 1, power: 1 }];
    expect(Math.max(...reachable(slowed, 'p1').values())).toBe(4);
    const rooted = duel();
    rooted.mages.p1.statuses = [{ kind: 'root', turns: 1, power: 0 }];
    expect(reachable(rooted, 'p1').size).toBe(0);
  });
});

describe('casting costs', () => {
  it('non-Fast Abilities cost exactly 1 AP; Fast Spells cost none', () => {
    for (const a of Object.values(ABILITIES)) expect(apCost(a), a.name).toBe(a.fast ? 0 : 1);
    expect(Object.values(ABILITIES).some((a) => a.fast)).toBe(true);
  });

  it('two AP means at most two non-Fast casts per turn', () => {
    let g = duel(['mend']);
    g.mages.p1.mana = 20;
    g = applyAction(g, { type: 'cast', player: 'p1', abilityId: 'mend', target: g.mages.p1.pos });
    g = applyAction(g, { type: 'cast', player: 'p1', abilityId: 'mend', target: g.mages.p1.pos });
    expect(g.mages.p1.ap).toBe(0);
    expect(castError(g, 'p1', 'staff-strike')).toMatch(/AP/);
  });
});
