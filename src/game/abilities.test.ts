import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { ABILITIES, DEFAULT_LOADOUTS } from './content';
import { actionError, applyAction, castError, createGame, validTargets } from './engine';
import type { Hex } from './hex';
import { validateLoadout } from './loadout';
import { UNLIMITED, type Action, type GameState, type Loadout } from './types';

const KIT = ['firebolt', 'fireball', 'icicle', 'nova', 'spear-thrust', 'empower', 'stone-pillar', 'block', 'sidestep'];
const loadout: Loadout = {
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 3, magic: 0, movespeed: 0 },
  abilityIds: ['staff-strike', ...KIT],
  passiveIds: [],
};

function duel(a: Hex = { q: 0, r: 2 }, b: Hex = { q: 0, r: -1 }): GameState {
  const g = createGame({
    seed: 3,
    radius: 6,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout, p2: loadout },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  g.mages.p1.pos = a;
  g.mages.p2.pos = b;
  g.mages.p1.mana = g.mages.p2.mana = 30;
  return g;
}
const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};
const cast = (g: GameState, abilityId: string, target: Hex, player: 'p1' | 'p2' = 'p1') =>
  act(g, { type: 'cast', player, abilityId, target });
const self = (g: GameState, abilityId: string) => cast(g, abilityId, g.mages[g.active].pos, g.active);
/** P1 launches, then P2's Reaction Phase begins. */
const handOver = (g: GameState) => act(g, { type: 'endTurn', player: 'p1' });
const resolve = (g: GameState) => act(g, { type: 'endReaction', player: 'p2' });
const hpLost = (g: GameState) => g.mages.p2.maxHp - g.mages.p2.hp;

describe('unlimited range', () => {
  it('Firebolt and Frost Lance reach the far edge of the board', () => {
    for (const id of ['firebolt', 'frost-lance']) {
      const shape = ABILITIES[id].effect.type === 'attack' ? (ABILITIES[id].effect as { shape: { range: number } }).shape : null;
      expect(shape!.range, id).toBe(UNLIMITED);
    }
    const g = duel({ q: 0, r: 5 }, { q: 0, r: -5 });
    expect(castError(g, 'p1', 'firebolt', { q: 0, r: -5 })).toBeNull();
    expect(handOver(cast(g, 'firebolt', { q: 0, r: -5 })).pending[0].area).toContain('0,-5');
  });
});

describe('Fireball', () => {
  it('explodes at the aimed hex', () => {
    const g = cast(duel({ q: 0, r: 4 }, { q: 3, r: -3 }), 'fireball', { q: 0, r: 0 });
    expect(g.pending[0].area).toContain('0,0');
    expect(g.pending[0].area).not.toContain('0,-2');
  });

  it('explodes early on the enemy standing in its path', () => {
    const g = cast(duel({ q: 0, r: 4 }, { q: 0, r: 0 }), 'fireball', { q: 0, r: -4 });
    expect(g.pending[0].area).toContain('0,0');
    expect(g.pending[0].area).not.toContain('0,-2');
  });

  it('explodes early at Rock', () => {
    const start = duel({ q: 0, r: 4 }, { q: 3, r: -3 });
    start.tiles['0,1'].terrain = 'rock';
    const g = cast(start, 'fireball', { q: 0, r: -4 });
    expect(g.pending[0].area).toContain('0,2');
    expect(g.pending[0].area).not.toContain('0,0');
  });
});

describe('Icicle', () => {
  it('can only target hexes in line of sight', () => {
    const g = duel({ q: 0, r: 4 }, { q: 3, r: -3 });
    g.tiles['0,2'].terrain = 'rock';
    expect(castError(g, 'p1', 'icicle', { q: 0, r: -1 })).toMatch(/aim/);
    expect(validTargets(g, 'p1', 'icicle').some((h) => h.q === 0 && h.r === -1)).toBe(false);
    expect(castError(g, 'p1', 'icicle', { q: 3, r: 1 })).toBeNull();
  });
});

describe('Arcane Nova', () => {
  it('spares the caster’s own hex and hits the enemy for 10', () => {
    let g = duel({ q: 0, r: 0 }, { q: 0, r: -2 });
    g = cast(g, 'nova', g.mages.p1.pos);
    expect(g.pending[0].area).not.toContain('0,0');
    g = resolve(handOver(g));
    expect(hpLost(g)).toBe(10);
    expect(g.mages.p1.hp).toBe(g.mages.p1.maxHp);
  });
});

describe('Block', () => {
  const underFire = (...ids: string[]) => {
    let g = duel();
    for (const id of ids) g = cast(g, id, g.mages.p2.pos);
    return handOver(g);
  };

  it('is a Reaction Technique: 1 AP, no Mana, reaction-only', () => {
    expect(castError(duel(), 'p1', 'block')).toMatch(/Reaction Phase/);
    const g = underFire('firebolt');
    const after = self({ ...g }, 'block');
    expect(after.mages.p2.ap).toBe(1);
    expect(after.mages.p2.mana).toBe(g.mages.p2.mana);
  });

  it('takes 4 off the first incoming Attack only', () => {
    const g = underFire('firebolt', 'icicle'); // 4 then 5
    expect(hpLost(resolve(self(g, 'block')))).toBe(0 + 5);
  });

  it('does not reduce below 0 and leaves a status in place', () => {
    const g = underFire('firebolt'); // 4 dmg + burn
    const after = resolve(self(g, 'block'));
    expect(hpLost(after)).toBe(0);
    expect(after.mages.p2.statuses.some((s) => s.kind === 'burn')).toBe(true);
  });

  it('is used by the AI when it prevents damage', () => {
    const g = underFire('icicle');
    g.mages.p2.abilities = [{ id: 'staff-strike' }, { id: 'block' }];
    expect(chooseAction(g, 'p2')).toMatchObject({ type: 'cast', abilityId: 'block' });
  });
});

describe('Empower', () => {
  it('is a Fast Spell: 0 AP, 3 Mana', () => {
    const g = self(duel(), 'empower');
    expect(g.mages.p1.ap).toBe(2);
    expect(g.mages.p1.mana).toBe(27);
  });

  it('adds 3 damage to Techniques launched afterwards this turn, not to Spells', () => {
    const start = duel({ q: 0, r: 0 }, { q: 0, r: -1 });
    const plain = resolve(handOver(cast(start, 'staff-strike', { q: 0, r: -1 })));
    const boosted = resolve(handOver(cast(self(start, 'empower'), 'staff-strike', { q: 0, r: -1 })));
    expect(hpLost(boosted)).toBe(hpLost(plain) + 3);
    const spell = resolve(handOver(cast(self(start, 'empower'), 'firebolt', { q: 0, r: -1 })));
    expect(hpLost(spell)).toBe(4);
  });

  it('does not boost a Technique launched before it, and lasts only this turn', () => {
    const start = duel({ q: 0, r: 0 }, { q: 0, r: -1 });
    const early = cast(start, 'staff-strike', { q: 0, r: -1 });
    expect(self(early, 'empower').pending[0].hit.damage).toBe(2);
    let g = handOver(self(start, 'empower'));
    expect(g.mages.p1.empower).toBe(0);
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(cast(g, 'staff-strike', { q: 0, r: -1 }).pending[0].hit.damage).toBe(2);
  });
});

describe('Stone Pillar', () => {
  it('turns an empty hex into Rock at once, for 1 AP and 3 Mana', () => {
    const g = cast(duel(), 'stone-pillar', { q: 1, r: 1 });
    expect(g.tiles['1,1'].terrain).toBe('rock');
    expect(g.mages.p1.ap).toBe(1);
    expect(g.mages.p1.mana).toBe(27);
  });

  it('needs an empty hex: no mages, Rock or Mana Crystals', () => {
    const g = duel();
    g.crystals = [{ size: 'small', pos: { q: 2, r: 1 }, state: 'ready' }];
    g.tiles['1,1'].terrain = 'rock';
    expect(castError(g, 'p1', 'stone-pillar', { q: 1, r: 1 })).toMatch(/rock/i);
    expect(castError(g, 'p1', 'stone-pillar', g.mages.p2.pos)).toMatch(/occupied/);
    expect(castError(g, 'p1', 'stone-pillar', g.mages.p1.pos)).toMatch(/another/);
    expect(castError(g, 'p1', 'stone-pillar', { q: 2, r: 1 })).toMatch(/Crystal/);
    expect(castError(g, 'p1', 'stone-pillar', { q: 0, r: -4 })).toMatch(/range/);
  });

  it('blocks walking and Lines', () => {
    let g = cast(duel({ q: 0, r: 2 }, { q: 3, r: -3 }), 'stone-pillar', { q: 0, r: 1 });
    expect(castError(g, 'p1', 'firebolt', { q: 0, r: 1 })).toMatch(/aim/);
    expect(g.tiles['0,1'].terrain).toBe('rock');
  });
});

describe('balance', () => {
  it('prices Spear Thrust 4, Spark 2 (2 Mana), Dragon’s Breath and Fireball cheaper, Block 3, Empower and Stone Pillar 2', () => {
    expect(ABILITIES['spear-thrust'].points).toBe(4);
    expect([ABILITIES.spark.points, ABILITIES.spark.mana]).toEqual([2, 2]);
    expect(ABILITIES['dragons-breath']).toMatchObject({ points: 2, mana: 3 });
    expect(ABILITIES.fireball).toMatchObject({ points: 3, mana: 5 });
    expect(ABILITIES.block).toMatchObject({ points: 3, mana: 0, kind: 'technique', timing: 'reaction' });
    expect(ABILITIES.empower).toMatchObject({ points: 2, mana: 3, fast: true });
    expect(ABILITIES['stone-pillar']).toMatchObject({ points: 2, mana: 3 });
  });

  it('default loadouts stay valid', () => {
    for (const l of DEFAULT_LOADOUTS) expect(validateLoadout(l), l.name).toEqual([]);
  });
});
