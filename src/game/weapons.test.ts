import { describe, expect, it } from 'vitest';
import { ABILITIES, DEFAULT_LOADOUTS, WEAPON_IDS, WEAPONS } from './content';
import { actionError, applyAction, castError, createGame, effectiveManaRegen, isDisarmed, usesPerTurn } from './engine';
import { chooseAction } from './ai';
import { abilityIdsFor, buildMage, loadoutCost, validateLoadout } from './loadout';
import type { Action, GameState, Loadout, WeaponId } from './types';

const loadout = (weapon: WeaponId, abilityIds: string[] = [], over: Partial<Loadout> = {}): Loadout => ({
  id: weapon,
  name: weapon,
  circle: 1,
  stats: { hp: 0, maxMana: 2, manaRegen: 0, movespeed: 0 },
  weapon,
  abilityIds,
  passiveIds: [],
  ...over,
});

function duel(weapon: WeaponId, abilityIds: string[] = []): GameState {
  const l = loadout(weapon, abilityIds);
  const g = createGame({ seed: 3, radius: 6, turnSeconds: 20, maxTurns: 60, loadouts: { p1: l, p2: loadout('unarmed') }, names: { p1: 'A', p2: 'B' } });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  g.mages.p1.pos = { q: 0, r: 2 };
  g.mages.p2.pos = { q: 0, r: 0 };
  g.mages.p1.mana = 30;
  return g;
}
const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};
const disarm = (g: GameState) => g.mages.p1.statuses.push({ kind: 'disarmed', turns: 2, power: 0 });

describe('weapons', () => {
  it('are Unarmed (0 pts), Staff 3, Wand 2, Sword 3, Spear 3 and Bow 4, and exactly one is carried', () => {
    expect(WEAPON_IDS.map((w) => [w, WEAPONS[w].points])).toEqual([
      ['unarmed', 0], ['staff', 3], ['wand', 2], ['sword', 3], ['spear', 3], ['bow', 4],
    ]);
    expect(validateLoadout(loadout('sword'))).toEqual([]);
    expect(validateLoadout({ ...loadout('sword'), weapon: 'banana' as WeaponId }).join()).toMatch(/weapon/i);
  });

  it('count toward the Loadout Points', () => {
    expect(loadoutCost(loadout('unarmed')) - loadoutCost(loadout('bow'))).toBe(-4);
  });

  it('give Staff and Wand +1 Mana Regen', () => {
    const regen = (w: WeaponId) => buildMage('p1', 'A', loadout(w), { q: 0, r: 0 }).manaRegen;
    expect([regen('unarmed'), regen('staff'), regen('wand'), regen('sword')]).toEqual([2, 3, 3, 2]);
  });

  it('give Sword, Spear and Bow a free default technique in the first slot', () => {
    expect(abilityIdsFor(loadout('sword', ['firebolt']))).toEqual(['slash', 'firebolt']);
    expect(abilityIdsFor(loadout('spear'))).toEqual(['thrust']);
    expect(abilityIdsFor(loadout('bow'))).toEqual(['shoot']);
    for (const w of ['unarmed', 'staff', 'wand'] as const) expect(abilityIdsFor(loadout(w))).toEqual([]);
    expect(buildMage('p1', 'A', loadout('sword'), { q: 0, r: 0 }).abilities[0].id).toBe('slash');
  });

  it('only allow a weapon technique with its own weapon, and never list a default one by hand', () => {
    expect(validateLoadout(loadout('unarmed', ['strike']))).toEqual([]);
    expect(validateLoadout(loadout('staff', ['staff-strike']))).toEqual([]);
    expect(validateLoadout(loadout('staff', ['strike'])).join()).toMatch(/Unarmed/);
    expect(validateLoadout(loadout('unarmed', ['staff-strike'])).join()).toMatch(/Staff/);
    expect(validateLoadout(loadout('sword', ['slash'])).join()).toMatch(/comes with/);
  });

  it('counts the default technique toward the 8 Abilities', () => {
    const seven = ['firebolt', 'meteor', 'frost-lance', 'icicle', 'spark', 'blink', 'mend'];
    expect(validateLoadout(loadout('sword', seven, { circle: 1 })).join()).not.toMatch(/at most 8/i);
    expect(validateLoadout(loadout('sword', [...seven, 'doom'], { circle: 1 })).join()).toMatch(/at most 8/i);
  });

  it('every built-in Loadout has a weapon', () => {
    for (const l of DEFAULT_LOADOUTS) expect(WEAPON_IDS).toContain(l.weapon);
  });
});

describe('weapon techniques', () => {
  const attack = (id: string) => ABILITIES[id].effect as { shape: Record<string, unknown>; hit: { damage: number } };

  it('Strike is Fast, 1 damage to one adjacent hex, 2 pts, Unarmed only', () => {
    expect(ABILITIES.strike).toMatchObject({ fast: true, points: 2, weapon: 'unarmed', mana: 0 });
    expect(attack('strike')).toMatchObject({ shape: { kind: 'single', range: 1 }, hit: { damage: 1 } });
  });

  it('Staff Strike is 1 pt, a 2-range Line for 2 damage, Staff only', () => {
    expect(ABILITIES['staff-strike']).toMatchObject({ points: 1, weapon: 'staff' });
    expect(attack('staff-strike')).toMatchObject({ shape: { kind: 'line', range: 2 }, hit: { damage: 2 } });
  });

  it('Slash, Thrust and Shoot come free with their weapon', () => {
    expect(attack('slash')).toMatchObject({ shape: { kind: 'meleeArc' }, hit: { damage: 5 } });
    expect(attack('thrust')).toMatchObject({ shape: { kind: 'line', range: 2, pierce: true }, hit: { damage: 4 } });
    expect(attack('shoot')).toMatchObject({ shape: { kind: 'line', range: 7 }, hit: { damage: 4 } });
    for (const [w, id] of [['sword', 'slash'], ['spear', 'thrust'], ['bow', 'shoot']] as const) {
      expect(WEAPONS[w].defaultTechnique).toBe(id);
      expect(ABILITIES[id]).toMatchObject({ points: 0, weapon: w });
    }
  });

  it('Shoot reaches 7 hexes and hits', () => {
    let g = duel('bow');
    g.mages.p1.pos = { q: 0, r: 6 };
    g.mages.p2.pos = { q: 0, r: -1 };
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'shoot', target: { q: 0, r: -1 } });
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endReaction', player: 'p2' });
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 4);
  });

  it('Shoot flies its full range even when aimed at a nearer hex', () => {
    let g = duel('bow');
    for (const t of Object.values(g.tiles)) t.terrain = 'plain';
    g.mages.p1.pos = { q: 0, r: 6 };
    g.mages.p2.pos = { q: 0, r: -1 };
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'shoot', target: { q: 0, r: 3 } }); // aimed 3 hexes out
    expect(g.pending[0].area).toHaveLength(7);
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endReaction', player: 'p2' });
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 4);
  });

  it('the AI aims Shoot straight at the enemy, so stepping directly back stays in the Line', () => {
    const g = duel('bow');
    g.mages.p1.pos = { q: 0, r: 0 };
    g.mages.p2.pos = { q: 0, r: -1 };
    const a = chooseAction(g, 'p1');
    expect(a).toMatchObject({ type: 'cast', abilityId: 'shoot', target: { q: 0, r: -1 } });
    const next = act(g, a);
    expect(next.pending[0].area).toContain('0,-2');
  });

  it('Slash hits for 5', () => {
    let g = duel('sword');
    g.mages.p1.pos = { q: 0, r: 1 };
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'slash', target: { q: 0, r: 0 } });
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endReaction', player: 'p2' });
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 5);
  });
});

describe('Cooldown', () => {
  it('Stasis costs 2 pts and can only be used every other turn', () => {
    expect(ABILITIES.stasis).toMatchObject({ points: 2, cooldown: 2 });
    let g = duel('unarmed', ['stasis']);
    g.mages.p1.mana = 30;
    g.mages.p2.pos = { q: 0, r: 0 };
    g.mages.p1.pos = { q: 0, r: 3 };
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'stasis', target: g.mages.p2.pos });
    expect(g.bidding).toBeTruthy();
    expect(g.mages.p1.abilities.find((a) => a.id === 'stasis')!.cooldown).toBe(2);
    g.bidding = null;
    expect(castError(g, 'p1', 'stasis', g.mages.p2.pos)).toMatch(/once per turn/i);
    // Through real turns: blocked on the next own turn, ready the one after.
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(castError(g, 'p1', 'stasis', g.mages.p2.pos)).toMatch(/ready in 1 turn\b/);
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(castError(g, 'p1', 'stasis', g.mages.p2.pos)).toBeNull();
  });
});

describe('Fast Abilities', () => {
  it('can be used once a turn unless they are Multi', () => {
    expect(usesPerTurn(ABILITIES.spark)).toBe(1);
    expect(usesPerTurn(ABILITIES.firebolt)).toBeUndefined();
    expect(usesPerTurn({ ...ABILITIES.spark, multi: true })).toBeUndefined();
    let g = duel('unarmed', ['spark']);
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'spark', target: { q: 0, r: 0 } });
    expect(castError(g, 'p1', 'spark', { q: 0, r: 0 })).toMatch(/once per turn/i);
  });

  it('Strike uses no AP and once a turn', () => {
    let g = duel('unarmed', ['strike']);
    g.mages.p1.pos = { q: 0, r: 1 };
    const ap = g.mages.p1.ap;
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'strike', target: { q: 0, r: 0 } });
    expect(g.mages.p1.ap).toBe(ap);
    expect(castError(g, 'p1', 'strike', { q: 0, r: 0 })).toMatch(/once per turn/i);
  });
});

describe('disarming', () => {
  it('loses weapon techniques, default ones included, but not other Techniques', () => {
    const g = duel('sword', ['channel-mana']);
    g.mages.p1.pos = { q: 0, r: 1 };
    expect(castError(g, 'p1', 'slash', { q: 0, r: 0 })).toBeNull();
    disarm(g);
    expect(isDisarmed(g.mages.p1)).toBe(true);
    expect(castError(g, 'p1', 'slash', { q: 0, r: 0 })).toMatch(/Disarmed/);
    expect(castError(g, 'p1', 'channel-mana', g.mages.p1.pos)).toBeNull();
  });

  it('loses the weapon Mana Regen bonus until it wears off', () => {
    const g = duel('staff');
    expect(effectiveManaRegen(g.mages.p1)).toBe(3);
    disarm(g);
    expect(effectiveManaRegen(g.mages.p1)).toBe(2);
  });

  it('stops a wand mage casting any Spell, but not a swordsman', () => {
    const wand = duel('wand', ['spark', 'firebolt']);
    expect(castError(wand, 'p1', 'firebolt', { q: 0, r: 0 })).toBeNull();
    disarm(wand);
    expect(castError(wand, 'p1', 'firebolt', { q: 0, r: 0 })).toMatch(/cannot cast/i);
    const staff = duel('staff', ['firebolt']);
    disarm(staff);
    expect(castError(staff, 'p1', 'firebolt', { q: 0, r: 0 })).toBeNull();
  });

  it('cannot touch an Unarmed mage', () => {
    const g = duel('unarmed', ['strike']);
    g.mages.p1.pos = { q: 0, r: 1 };
    disarm(g);
    expect(isDisarmed(g.mages.p1)).toBe(false);
    expect(castError(g, 'p1', 'strike', { q: 0, r: 0 })).toBeNull();
  });
});
