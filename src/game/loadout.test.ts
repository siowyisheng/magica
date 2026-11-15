import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUTS } from './content';
import { buildMage, CIRCLE_POINTS, loadoutCost, statStepCost, validateLoadout } from './loadout';
import type { Loadout } from './types';

const blank = (patch: Partial<Loadout> = {}): Loadout => ({
  id: 't',
  name: 'Test',
  circle: 3,
  stats: { hp: 0, magic: 0, movespeed: 0 },
  abilityIds: ['staff-strike'],
  passiveIds: [],
  ...patch,
});

describe('Circles', () => {
  it('give 30 / 20 / 10 Loadout Points', () => {
    expect(CIRCLE_POINTS).toEqual({ 1: 30, 2: 20, 3: 10 });
  });
});

describe('stat steps', () => {
  it('get more expensive the more you buy', () => {
    expect([1, 2, 3, 4].map((k) => statStepCost('hp', k))).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3].map((k) => statStepCost('magic', k))).toEqual([2, 3, 4]);
    expect([1, 2, 3].map((k) => statStepCost('movespeed', k))).toEqual([3, 5, 7]);
  });

  it('turn into stats on top of the base 10 HP / 3 Magic / 3 Movespeed', () => {
    const m = buildMage('p1', 'A', blank({ circle: 1, stats: { hp: 4, magic: 3, movespeed: 2 } }), { q: 0, r: 0 });
    expect(m.maxHp).toBe(22);
    expect(m.magic).toBe(6);
    expect(m.movespeed).toBe(5);
    const base = buildMage('p1', 'A', blank(), { q: 0, r: 0 });
    expect([base.maxHp, base.magic, base.movespeed]).toEqual([10, 3, 3]);
  });

  it('cost the sum of their steps', () => {
    expect(loadoutCost(blank({ stats: { hp: 4, magic: 3, movespeed: 2 } }))).toBe(10 + 9 + 8);
  });
});

describe('validation', () => {
  it('rejects overspending the Circle budget', () => {
    expect(validateLoadout(blank({ circle: 3, stats: { hp: 4, magic: 0, movespeed: 0 } }))).toEqual([]);
    expect(validateLoadout(blank({ circle: 3, stats: { hp: 4, magic: 1, movespeed: 0 } })).join()).toMatch(/points/i);
  });

  it('rejects stats below base', () => {
    expect(validateLoadout(blank({ stats: { hp: -1, magic: 0, movespeed: 0 } })).length).toBeGreaterThan(0);
  });

  it('always has Staff Strike in slot 1', () => {
    expect(validateLoadout(blank({ abilityIds: [] })).join()).toMatch(/Staff Strike/);
    expect(validateLoadout(blank({ abilityIds: ['firebolt', 'staff-strike'] })).join()).toMatch(/Staff Strike/);
  });

  it('caps a Loadout at 8 Abilities, Staff Strike included', () => {
    const nine = ['staff-strike', 'firebolt', 'meteor', 'frost-lance', 'cleave', 'quick-stab', 'blink', 'mend', 'smite'];
    expect(validateLoadout(blank({ circle: 1, abilityIds: nine.slice(0, 8) })).join()).not.toMatch(/8/);
    expect(validateLoadout(blank({ circle: 1, abilityIds: nine })).join()).toMatch(/8/);
  });

  it('ships 6 built-in Loadouts, 2 per Circle, all valid', () => {
    expect(DEFAULT_LOADOUTS).toHaveLength(6);
    for (const c of [1, 2, 3] as const) expect(DEFAULT_LOADOUTS.filter((l) => l.circle === c)).toHaveLength(2);
    for (const l of DEFAULT_LOADOUTS) expect(validateLoadout(l), l.name).toEqual([]);
  });
});
