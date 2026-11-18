import { describe, expect, it } from 'vitest';
import { PASSIVES } from './content';
import { validateLoadout } from './loadout';
import type { Loadout } from './types';

const loadout = (passiveIds: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: 2, manaRegen: 0, movespeed: 0 },
  weapon: 'unarmed',
  abilityIds: ['firebolt'],
  passiveIds,
});

describe('Passives', () => {
  it('there are none for now', () => {
    expect(Object.keys(PASSIVES)).toEqual([]);
  });

  it('a Loadout that names one is rejected', () => {
    expect(validateLoadout(loadout([])).join()).not.toMatch(/Passive/);
    expect(validateLoadout(loadout(['iron-skin'])).join()).toMatch(/Unknown Passive/);
  });
});
