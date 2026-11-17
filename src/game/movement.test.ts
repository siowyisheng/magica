import { describe, expect, it } from 'vitest';
import { ABILITIES } from './content';
import { apCost, applyAction, castError, createGame, reachable } from './engine';
import type { Hex } from './hex';
import type { GameState, Loadout } from './types';

const loadout = (abilities: string[] = [], movespeed = 0): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: 0, manaRegen: 0, movespeed },
  weapon: 'staff', abilityIds: ['staff-strike', ...abilities],
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

describe('the walked path of a Move', () => {
  it('goes around rocks hex by hex, from where the mage started to where it ended', () => {
    const g = duel([], 2);
    const from = g.mages.p1.pos; // (0, 5)
    for (const h of [{ q: 0, r: 4 }, { q: 1, r: 3 }, { q: -1, r: 4 }]) g.tiles[`${h.q},${h.r}`].terrain = 'rock';
    const to = { q: 0, r: 3 };
    const after = move(g, to);
    const ev = after.events.find((e) => e.kind === 'move' && e.path)!;
    expect(ev.player).toBe('p1');
    expect(ev.path![0]).toEqual(from);
    expect(ev.path!.at(-1)).toEqual(to);
    for (const h of ev.path!) expect(after.tiles[`${h.q},${h.r}`].terrain).not.toBe('rock');
    ev.path!.slice(1).forEach((h, i) => expect(Math.max(Math.abs(h.q - ev.path![i].q), Math.abs(h.r - ev.path![i].r), Math.abs(h.q + h.r - ev.path![i].q - ev.path![i].r))).toBe(1));
    expect(ev.path!.length).toBeGreaterThan(3); // the straight line is blocked, so it is longer
  });
});

describe('AI positioning', () => {
  it('walks around a rock wall toward the enemy even when every step first leads away in a straight line', async () => {
    const { chooseAction } = await import('./ai');
    const { walkPath } = await import('./engine');
    const g = duel();
    g.mages.p1.pos = { q: 0, r: 2 };
    // A wall across the board between the mages, open only at the far right end.
    for (let q = -6; q <= 4; q++) g.tiles[`${q},0`].terrain = 'rock';
    g.crystals = [];
    const steps = (from: Hex) => walkPath(g, from, g.mages.p2.pos, '').length;
    const a = chooseAction(g, 'p1');
    expect(a.type).toBe('move');
    expect(steps((a as { to: Hex }).to)).toBeLessThan(steps(g.mages.p1.pos));
  });
});
