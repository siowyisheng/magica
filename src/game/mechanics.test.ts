import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { ABILITIES, DEFAULT_LOADOUTS } from './content';
import { applyAction, createGame, replay } from './engine';
import type { Hex } from './hex';
import { validateLoadout } from './loadout';
import type { Action, GameState, Loadout, MatchConfig } from './types';

/** A duel on an all-plain board with P1 at a and P2 at b, P1 to act with plenty of Mana. */
function arena(p1Abilities: string[], a: Hex, b: Hex, p2Passives: string[] = []): GameState {
  const stats = { hp: 3, maxMana: 0, manaRegen: 0, movespeed: 0 };
  const l1: Loadout = { id: 'a', name: 'A', circle: 1, stats, weapon: 'staff', abilityIds: ['staff-strike', ...p1Abilities], passiveIds: [] };
  const l2: Loadout = { id: 'b', name: 'B', circle: 1, stats, weapon: 'staff', abilityIds: ['staff-strike'], passiveIds: p2Passives };
  const g = createGame(baseConfig(l1, l2));
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.mages.p1.pos = a;
  g.mages.p2.pos = b;
  g.mages.p1.mana = 99;
  g.crystals = [];
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

/** End P1's turn and let P2's Reaction Phase pass without reacting, so pending Attacks land. */
function land(g: GameState): GameState {
  g = applyAction(g, { type: 'endTurn', player: 'p1' });
  return g.phase === 'reaction' ? applyAction(g, { type: 'endReaction', player: 'p2' }) : g;
}

describe('catalogue', () => {
  const all = Object.values(ABILITIES);
  const spells = all.filter((a) => a.kind === 'spell');

  it('has 6 Techniques (4 of them weapon techniques, Block the only Reaction Technique), a Reaction Spell and plenty of other Spells', () => {
    expect(all.filter((a) => a.kind === 'technique')).toHaveLength(6);
    expect(all.filter((a) => a.weapon).map((a) => a.id)).toEqual(['strike', 'staff-strike', 'slash', 'thrust', 'shoot']);
    expect(all.filter((a) => a.kind === 'technique' && a.timing === 'reaction').map((a) => [a.id, a.points])).toEqual([['block', 3]]);
    expect(spells.filter((a) => a.timing === 'reaction' || a.timing === 'both')).toHaveLength(1);
    expect(spells.filter((a) => !a.timing || a.timing === 'action').length).toBeGreaterThanOrEqual(10);
  });

  it('spans Mana costs from 1 up to the big spells', () => {
    const costs = spells.map((a) => a.mana);
    expect(Math.min(...costs)).toBe(1);
    expect(Math.max(...costs)).toBeGreaterThanOrEqual(10);
  });

  it('prices basics at 1–2 points and nothing above 12', () => {
    expect(all.filter((a) => a.points <= 2).length).toBeGreaterThan(5);
    expect(Math.max(...all.map((a) => a.points))).toBeLessThanOrEqual(12);
  });

  it('has unique names and icons', () => {
    expect(new Set(all.map((a) => a.name)).size).toBe(all.length);
    expect(new Set(all.map((a) => a.icon)).size).toBe(all.length);
  });

  it('ships 6 valid built-in Loadouts, 2 per Circle', () => {
    for (const c of [1, 2, 3]) expect(DEFAULT_LOADOUTS.filter((l) => l.circle === c)).toHaveLength(2);
    for (const l of DEFAULT_LOADOUTS) expect(validateLoadout(l), l.name).toEqual([]);
  });
});

describe('Attack riders', () => {
  it('lifesteal heals the caster by the damage dealt', () => {
    const g0 = arena(['soul-drain'], { q: 0, r: 2 }, { q: 0, r: 0 });
    g0.mages.p1.hp = 3;
    expect(land(cast(g0, 'soul-drain', { q: 0, r: 0 })).mages.p1.hp).toBe(8); // 5 damage, 5 healed
  });

  it('vulnerable adds to every later hit', () => {
    let g = arena(['firebolt'], { q: 0, r: 3 }, { q: 0, r: 0 });
    g.mages.p2.statuses.push({ kind: 'vulnerable', turns: 2, power: 2 });
    g = land(cast(g, 'firebolt', { q: 0, r: 0 }));
    expect(g.mages.p2.maxHp - g.mages.p2.hp).toBe(4 + 2);
  });

});

describe('every built-in matchup', () => {
  it('AI vs AI terminates with legal moves and replays identically', { timeout: 60000 }, () => {
    for (const a of DEFAULT_LOADOUTS) {
      for (const b of DEFAULT_LOADOUTS) {
        const config = baseConfig(a, b);
        let g = createGame(config);
        const actions: Action[] = [];
        for (let i = 0; i < 4000 && !g.winner; i++) {
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
