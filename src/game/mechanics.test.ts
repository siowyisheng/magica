import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { ABILITIES, DEFAULT_LOADOUTS } from './content';
import { applyAction, castError, createGame, replay } from './engine';
import { key, type Hex } from './hex';
import type { Action, GameState, Loadout, MatchConfig } from './types';

/** A duel on an all-plain board with p1 at a and p2 at b, p1 to act. */
function arena(p1Abilities: string[], a: Hex, b: Hex): GameState {
  const stats = { hp: 3, magic: 0, movespeed: 0 };
  const l1: Loadout = { id: 'a', name: 'A', circle: 1, stats, abilityIds: ['staff-strike', ...p1Abilities], passiveIds: [] };
  const l2: Loadout = { id: 'b', name: 'B', circle: 1, stats, abilityIds: ['staff-strike', 'cleave'], passiveIds: [] };
  const g = createGame({ ...baseConfig(l1, l2) });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.mages.p1.pos = a;
  g.mages.p2.pos = b;
  g.mages.p1.ap = 10;
  return g;
}

const baseConfig = (l1: Loadout, l2: Loadout): MatchConfig => ({
  seed: 7,
  radius: 6,
  turnSeconds: 20,
  maxTurns: 60,
  loadouts: { p1: l1, p2: l2 },
  names: { p1: 'A', p2: 'B' },
});

const cast = (g: GameState, abilityId: string, target: Hex) => applyAction(g, { type: 'cast', player: 'p1', abilityId, target });

describe('content', () => {
  it('ability ids are unique', () => {
    expect(new Set(Object.values(ABILITIES).map((a) => a.icon + a.name)).size).toBe(Object.keys(ABILITIES).length);
  });
});

describe('new mechanics', () => {
  it('knockback pushes away from the caster', () => {
    const g = cast(arena(['boulder-toss'], { q: 0, r: 2 }, { q: 0, r: 0 }), 'boulder-toss', { q: 0, r: 0 });
    expect(g.mages.p2.pos).toEqual({ q: 0, r: -1 });
  });

  it('knockback into rock deals collision damage and does not move', () => {
    const g0 = arena(['boulder-toss'], { q: 0, r: 2 }, { q: 0, r: 0 });
    g0.tiles[key({ q: 0, r: -1 })].terrain = 'rock';
    const hp = g0.mages.p2.hp;
    const g = cast(g0, 'boulder-toss', { q: 0, r: 0 });
    expect(g.mages.p2.pos).toEqual({ q: 0, r: 0 });
    expect(g.mages.p2.hp).toBe(hp - 3 - 2);
  });

  it('negative knockback pulls toward the caster and stops adjacent', () => {
    const g = cast(arena(['riptide'], { q: 0, r: 3 }, { q: 0, r: 0 }), 'riptide', { q: 0, r: 0 });
    expect(g.mages.p2.pos).toEqual({ q: 0, r: 2 });
  });

  it('lifesteal heals the caster', () => {
    const g0 = arena(['exsanguinate'], { q: 0, r: 1 }, { q: 0, r: 0 });
    g0.mages.p1.hp = 5;
    const g = cast(g0, 'exsanguinate', { q: 0, r: 0 });
    expect(g.mages.p1.hp).toBe(9);
  });

  it('armor reduces damage, vulnerable increases it', () => {
    const g0 = arena(['cleave', 'mark-for-death'], { q: 0, r: 1 }, { q: 0, r: 0 });
    g0.mages.p2.armor = 1;
    const hp = g0.mages.p2.hp;
    let g = cast(g0, 'mark-for-death', { q: 0, r: 0 });
    expect(g.mages.p2.hp).toBe(hp); // status-only: no damage
    g = cast(g, 'cleave', { q: 0, r: 0 });
    const cleave = ABILITIES.cleave.effect as { amount: number };
    expect(g.mages.p2.hp).toBe(hp - (cleave.amount + 2 - 1));
  });

  it('spareCaster AoE does not hit you', () => {
    const g0 = arena(['tremor'], { q: 0, r: 1 }, { q: 0, r: 0 });
    const g = cast(g0, 'tremor', { q: 0, r: 1 });
    expect(g.mages.p1.hp).toBe(g0.mages.p1.hp);
    expect(g.mages.p2.hp).toBeLessThan(g0.mages.p2.hp);
  });

  it('swap trades places', () => {
    const g = cast(arena(['shadow-swap'], { q: 0, r: 3 }, { q: 0, r: 0 }), 'shadow-swap', { q: 0, r: 0 });
    expect(g.mages.p1.pos).toEqual({ q: 0, r: 0 });
    expect(g.mages.p2.pos).toEqual({ q: 0, r: 3 });
  });

  it('terraform raises rock, but not under a unit', () => {
    const g0 = arena(['raise-earth'], { q: 0, r: 3 }, { q: 0, r: 0 });
    expect(castError(g0, 'p1', 'raise-earth', { q: 0, r: 0 })).toMatch(/occupied/);
    const g = cast(g0, 'raise-earth', { q: 0, r: 1 });
    expect(g.tiles[key({ q: 0, r: 1 })].terrain).toBe('rock');
  });

  it('sacrifice trades HP for AP and cannot kill you', () => {
    const g0 = arena(['crimson-pact'], { q: 0, r: 3 }, { q: 0, r: 0 });
    const g = cast(g0, 'crimson-pact', { q: 0, r: 3 });
    expect(g.mages.p1.hp).toBe(g0.mages.p1.hp - 3);
    expect(g.mages.p1.ap).toBe(g0.mages.p1.ap + 2);
    g0.mages.p1.hp = 3;
    expect(castError(g0, 'p1', 'crimson-pact')).toMatch(/HP/);
  });

  it('cleanse removes statuses; haste adds move; rewind cuts cooldowns', () => {
    let g = arena(['purify', 'haste', 'rewind', 'stasis'], { q: 0, r: 3 }, { q: 0, r: 0 });
    g.mages.p1.statuses = [{ kind: 'poison', turns: 3, power: 1 }];
    g.mages.p1.abilities.find((a) => a.id === 'stasis')!.cooldown = 3;
    g = cast(g, 'purify', { q: 0, r: 3 });
    expect(g.mages.p1.statuses).toEqual([]);
    const move = g.mages.p1.moveLeft;
    g = cast(g, 'haste', { q: 0, r: 3 });
    expect(g.mages.p1.moveLeft).toBe(move + 3);
    g = cast(g, 'rewind', { q: 0, r: 3 });
    expect(g.mages.p1.abilities.find((a) => a.id === 'stasis')!.cooldown).toBe(1);
  });

  it('poison ticks and regen heals at turn start', () => {
    let g = arena(['soul-drain'], { q: 0, r: 3 }, { q: 0, r: 0 });
    g.mages.p1.regen = 1;
    g.mages.p2.statuses = [{ kind: 'poison', turns: 2, power: 1 }];
    g.mages.p2.regen = 0;
    const hp2 = g.mages.p2.hp;
    g = applyAction(g, { type: 'endTurn', player: 'p1' });
    expect(g.mages.p2.hp).toBe(hp2 - 1);
    g.mages.p1.hp = 10;
    g = applyAction(g, { type: 'endTurn', player: 'p2' });
    expect(g.mages.p1.hp).toBe(11); // regen 1
  });
});

describe('every default matchup', () => {
  it('AI vs AI terminates with legal moves and replays identically', () => {
    for (const a of DEFAULT_LOADOUTS) {
      for (const b of DEFAULT_LOADOUTS) {
        const config = baseConfig(a, b);
        let g = createGame(config);
        const actions: Action[] = [];
        for (let i = 0; i < 3000 && !g.winner; i++) {
          const act = chooseAction(g, g.active);
          const next = applyAction(g, act);
          expect(next, `${a.name} vs ${b.name}: illegal ${JSON.stringify(act)}`).not.toBe(g);
          actions.push(act);
          g = next;
        }
        expect(g.winner, `${a.name} vs ${b.name}`).not.toBeNull();
        expect(replay(config, actions)).toEqual(g);
      }
    }
  });
});
