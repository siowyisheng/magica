import { describe, expect, it } from 'vitest';
import { PASSIVES } from './content';
import { applyAction, createGame, round } from './engine';
import { loadoutCost, validateLoadout } from './loadout';
import type { GameState, Loadout } from './types';

const loadout = (passiveIds: string[], abilities: string[] = []): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, magic: 0, movespeed: 0 },
  abilityIds: ['staff-strike', ...abilities],
  passiveIds,
});

function duel(p1: string[], p2: string[] = [], abilities: string[] = ['firebolt']): GameState {
  const g = createGame({
    seed: 4,
    radius: 6,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(p1, abilities), p2: loadout(p2, abilities) },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  return g;
}
const endTurn = (g: GameState) => applyAction(g, { type: 'endTurn', player: g.active });

describe('Passives', () => {
  it('are priced as agreed and do not count toward the 8-Ability cap', () => {
    expect(Object.fromEntries(Object.values(PASSIVES).map((p) => [p.id, p.points]))).toEqual({
      'mana-well': 3,
      'iron-skin': 3,
      regeneration: 3,
      wellspring: 4,
    });
    const eight = ['staff-strike', 'firebolt', 'frost-lance', 'doom', 'mend', 'blink', 'ward', 'icicle'];
    const l: Loadout = { ...loadout(['mana-well', 'iron-skin', 'regeneration', 'wellspring']), abilityIds: eight };
    expect(validateLoadout(l).join()).not.toMatch(/8/);
    expect(loadoutCost(loadout(['wellspring']))).toBe(4);
  });

  it('Mana Well: Absorb Mana gives +50%', () => {
    let g = duel(['mana-well']);
    while (round(g) < 4 || g.active !== 'p1') g = endTurn(g);
    const large = g.crystals.find((c) => c.size === 'large')!;
    g.mages.p1.pos = large.pos;
    g.mages.p1.mana = 0;
    expect(applyAction(g, { type: 'absorb', player: 'p1' }).mages.p1.mana).toBe(12); // 8 × 1.5
  });

  it('Iron Skin: every hit taken is 1 lower, but at least 1', () => {
    let g = duel([], ['iron-skin']);
    g.mages.p1.pos = { q: 0, r: 2 };
    g.mages.p2.pos = { q: 0, r: -1 };
    g.mages.p1.mana = 30;
    g = applyAction(g, { type: 'cast', player: 'p1', abilityId: 'firebolt', target: g.mages.p2.pos });
    g = applyAction(endTurn(g), { type: 'endReaction', player: 'p2' });
    expect(g.mages.p2.maxHp - g.mages.p2.hp).toBe(2); // Firebolt 3 − 1
  });

  it('Iron Skin does not soften damage-over-time ticks (they are not hits)', () => {
    let g = duel([], ['iron-skin']);
    g.mages.p2.statuses = [{ kind: 'poison', turns: 2, power: 1 }];
    g = endTurn(g);
    expect(g.mages.p2.maxHp - g.mages.p2.hp).toBe(1);
  });

  it('Regeneration: +1 HP at the start of your turn', () => {
    let g = duel(['regeneration']);
    g.mages.p1.hp = 5;
    g = endTurn(endTurn(g));
    expect(g.mages.p1.hp).toBe(6);
  });

  it('Wellspring: +1 Mana per turn on top of Magic', () => {
    let g = duel(['wellspring']);
    g = endTurn(endTurn(g));
    expect(g.mages.p1.mana).toBe(3 + 3 + 1);
  });

  it('show up on the mage in a match', () => {
    expect(duel(['iron-skin', 'wellspring']).mages.p1.passiveIds).toEqual(['iron-skin', 'wellspring']);
  });
});
