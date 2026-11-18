import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUTS } from './content';
import { buildMage, CIRCLE_POINTS, loadoutCost, statStepCost, validateLoadout } from './loadout';
import type { Loadout } from './types';

const blank = (patch: Partial<Loadout> = {}): Loadout => ({
  id: 't',
  name: 'Test',
  circle: 3,
  stats: { hp: 0, maxMana: 0, manaRegen: 0, movespeed: 0 },
  weapon: 'unarmed', abilityIds: [],
  passiveIds: [],
  ...patch,
});

describe('Circles', () => {
  it('give 30 / 20 / 10 Loadout Points', () => {
    expect(CIRCLE_POINTS).toEqual({ 1: 30, 2: 20, 3: 10 });
  });
});

describe('stat steps', () => {
  it('Magic and Movespeed get more expensive the more you buy; HP is always 1 point a step', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((k) => statStepCost('hp', k))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect([1, 2, 3, 4, 5].map((k) => statStepCost('manaRegen', k))).toEqual([2, 3, 4, 4, 4]);
    expect([1, 2, 3].map((k) => statStepCost('maxMana', k))).toEqual([1, 1, 1]);
    expect([1, 2, 3].map((k) => statStepCost('movespeed', k))).toEqual([3, 5, 7]);
  });

  it('HP pays +3 for each of the first 2 points, +2 for the next 3, then +1', () => {
    const hp = (steps: number) => buildMage('p1', 'A', blank({ stats: { hp: steps, maxMana: 0, manaRegen: 0, movespeed: 0 } }), { q: 0, r: 0 }).maxHp;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 10].map(hp)).toEqual([10, 13, 16, 18, 20, 22, 23, 24, 27]);
  });

  it('turn into stats on top of the base 10 HP / 3 Magic / 3 Movespeed', () => {
    const m = buildMage('p1', 'A', blank({ circle: 1, stats: { hp: 4, maxMana: 3, manaRegen: 3, movespeed: 2 } }), { q: 0, r: 0 });
    expect(m.maxHp).toBe(20);
    expect(m.maxMana).toBe(40); // +10 a step
    expect(m.manaRegen).toBe(5);
    expect(m.movespeed).toBe(5);
    const base = buildMage('p1', 'A', blank(), { q: 0, r: 0 });
    expect([base.maxHp, base.maxMana, base.manaRegen, base.movespeed]).toEqual([10, 10, 2, 3]);
  });

  it('cost the sum of their steps', () => {
    expect(loadoutCost(blank({ stats: { hp: 4, maxMana: 3, manaRegen: 5, movespeed: 2 } }))).toBe(4 + 3 + (2 + 3 + 4 + 4 + 4) + 8);
  });
});

describe('validation', () => {
  it('rejects overspending the Circle budget', () => {
    expect(validateLoadout(blank({ circle: 3, stats: { hp: 10, maxMana: 0, manaRegen: 0, movespeed: 0 } }))).toEqual([]);
    expect(validateLoadout(blank({ circle: 3, stats: { hp: 10, maxMana: 1, manaRegen: 0, movespeed: 0 } })).join()).toMatch(/points/i);
  });

  it('rejects stats below base', () => {
    expect(validateLoadout(blank({ stats: { hp: -1, maxMana: 0, manaRegen: 0, movespeed: 0 } })).length).toBeGreaterThan(0);
  });

  it('caps a Loadout at 8 Abilities, counting the weapon technique', () => {
    const nine = ['spark', 'firebolt', 'meteor', 'frost-lance', 'icicle', 'spark', 'cold-touch', 'lightning-bolt', 'doom'];
    expect(validateLoadout(blank({ circle: 1, abilityIds: nine.slice(0, 8) })).join()).not.toMatch(/8/);
    expect(validateLoadout(blank({ circle: 1, abilityIds: nine })).join()).toMatch(/8/);
  });

  it('ships 6 built-in Loadouts, 2 per Circle, all valid', () => {
    expect(DEFAULT_LOADOUTS).toHaveLength(6);
    for (const c of [1, 2, 3] as const) expect(DEFAULT_LOADOUTS.filter((l) => l.circle === c)).toHaveLength(2);
    for (const l of DEFAULT_LOADOUTS) expect(validateLoadout(l), l.name).toEqual([]);
  });
});
