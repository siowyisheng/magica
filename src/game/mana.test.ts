import { describe, expect, it } from 'vitest';
import { ABILITIES } from './content';
import { applyAction, castError, createGame, maxMana } from './engine';
import type { GameState, Loadout, MatchConfig } from './types';

const loadout = (regenSteps: number, abilities: string[] = [], maxManaSteps = 0): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: maxManaSteps, manaRegen: regenSteps, movespeed: 0 },
  weapon: 'unarmed', abilityIds: abilities,
  passiveIds: [],
});

const config = (l1: Loadout, l2: Loadout): MatchConfig => ({
  seed: 1,
  radius: 6,
  turnSeconds: 20,
  maxTurns: 60,
  loadouts: { p1: l1, p2: l2 },
  names: { p1: 'A', p2: 'B' },
});

const endTurn = (g: GameState) => applyAction(g, { type: 'endTurn', player: g.active });

describe('Mana', () => {
  it('starts at Mana Regen, and P2 gets one extra regen to offset going second', () => {
    const g = createGame(config(loadout(0), loadout(2)));
    expect(g.mages.p1.mana).toBe(2);
    expect(g.mages.p2.mana).toBe(8); // Mana Regen 4, plus a bonus of 4
  });

  it('Max Mana is 10 plus 10 a step, and Mana Regen is 2 plus 1 a step', () => {
    const g = createGame(config(loadout(0), loadout(3, [], 2)));
    expect([g.mages.p1.maxMana, g.mages.p1.manaRegen]).toEqual([10, 2]);
    expect([g.mages.p2.maxMana, g.mages.p2.manaRegen]).toEqual([30, 5]);
  });

  it('regenerates Mana Regen at the start of each own turn, but not on the first', () => {
    let g = createGame(config(loadout(0), loadout(0)));
    g = endTurn(g); // P2's first turn: no regen
    expect(g.mages.p2.mana).toBe(4);
    g = endTurn(g); // P1's second turn
    expect(g.mages.p1.mana).toBe(4);
    g = endTurn(g);
    expect(g.mages.p2.mana).toBe(6);
  });

  it('is capped at Max Mana', () => {
    let g = createGame(config(loadout(0), loadout(0)));
    expect(maxMana(g.mages.p1)).toBe(10);
    for (let i = 0; i < 40; i++) g = endTurn(g);
    expect(g.mages.p1.mana).toBe(10);
    expect(g.mages.p2.mana).toBe(10);
  });

  it('is spent by Spells, which cannot be cast without enough', () => {
    let g = createGame(config(loadout(0, ['firebolt']), loadout(0)));
    const cost = ABILITIES.firebolt.mana;
    expect(cost).toBeGreaterThan(0);
    g.mages.p1.mana = cost - 1;
    expect(castError(g, 'p1', 'firebolt')).toMatch(/Mana/);
    g.mages.p1.mana = cost;
    g.mages.p2.pos = { q: g.mages.p1.pos.q, r: g.mages.p1.pos.r - 2 };
    g = applyAction(g, { type: 'cast', player: 'p1', abilityId: 'firebolt', target: g.mages.p2.pos });
    expect(g.mages.p1.mana).toBe(0);
  });

  it('is never spent by Techniques', () => {
    for (const a of Object.values(ABILITIES)) if (a.kind === 'technique') expect(a.mana, a.name).toBe(0);
    for (const a of Object.values(ABILITIES)) if (a.kind === 'spell') expect(a.mana, a.name).toBeGreaterThan(0);
  });
});
