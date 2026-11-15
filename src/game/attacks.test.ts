import { describe, expect, it } from 'vitest';
import { actionError, applyAction, createGame, validTargets } from './engine';
import type { Hex } from './hex';
import type { Action, GameState, Loadout, PlayerId } from './types';

const loadout = (abilities: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 3, magic: 0, movespeed: 0 },
  abilityIds: ['staff-strike', ...abilities],
  passiveIds: [],
});

/** Open board; P1 (attacker) at `a`, P2 at `b`. Both have plenty of Mana. */
function duel(a: Hex, b: Hex, abilities = ['firebolt', 'icicle', 'plague', 'doom']): GameState {
  const g = createGame({
    seed: 3,
    radius: 6,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(abilities), p2: loadout(abilities) },
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
const cast = (g: GameState, abilityId: string, target: Hex, player: PlayerId = 'p1') =>
  act(g, { type: 'cast', player, abilityId, target });
const endTurn = (g: GameState) => act(g, { type: 'endTurn', player: g.active });
const endReaction = (g: GameState) => act(g, { type: 'endReaction', player: g.active });
const move = (g: GameState, to: Hex) => act(g, { type: 'move', player: g.active, to });

describe('delayed Attacks', () => {
  it('do no damage until the defender’s Reaction Phase ends', () => {
    let g = duel({ q: 0, r: 2 }, { q: 0, r: -1 });
    const hp = g.mages.p2.hp;
    g = cast(g, 'firebolt', { q: 0, r: -1 });
    expect(g.pending).toHaveLength(1);
    expect(g.mages.p2.hp).toBe(hp);
    g = endTurn(g);
    expect(g.active).toBe('p2');
    expect(g.phase).toBe('reaction');
    expect(g.mages.p2.hp).toBe(hp);
    g = endReaction(g);
    expect(g.phase).toBe('action');
    expect(g.mages.p2.hp).toBeLessThan(hp);
    expect(g.pending).toHaveLength(0);
  });

  it('skip the Reaction Phase when nothing is pending', () => {
    const g = endTurn(duel({ q: 0, r: 2 }, { q: 0, r: -1 }));
    expect(g.phase).toBe('action');
  });

  it('only allow Moves and ending the phase during the Reaction Phase', () => {
    let g = cast(duel({ q: 0, r: 2 }, { q: 0, r: -1 }), 'firebolt', { q: 0, r: -1 });
    g = endTurn(g);
    expect(actionError(g, { type: 'cast', player: 'p2', abilityId: 'firebolt', target: { q: 0, r: 2 } })).toMatch(/Reaction/);
    expect(actionError(g, { type: 'endTurn', player: 'p2' })).toMatch(/Reaction/);
    expect(actionError(g, { type: 'endReaction', player: 'p2' })).toBeNull();
    const after = endReaction(g);
    expect(actionError(after, { type: 'endReaction', player: 'p2' })).toMatch(/Reaction/);
  });

  it('carry leftover Movement Points from the Reaction Phase into the Action Phase', () => {
    let g = cast(duel({ q: 0, r: 2 }, { q: 0, r: -1 }), 'firebolt', { q: 0, r: -1 });
    g = endTurn(g);
    g = move(g, { q: 1, r: -1 });
    expect(g.mages.p2.mp).toBe(2);
    g = endReaction(g);
    expect(g.mages.p2.mp).toBe(2);
    expect(g.mages.p2.ap).toBe(1);
  });
});

describe('dodging, by shape', () => {
  // [ability, P1 pos, P2 pos, aim, a safe hex for P2, a hex inside the area other than P2's]
  const cases: Array<[string, Hex, Hex, Hex, Hex, Hex]> = [
    ['firebolt', { q: 0, r: 2 }, { q: 0, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 0, r: 0 }], // Line
    ['icicle', { q: 0, r: 4 }, { q: 0, r: -1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 0, r: -1 }], // Single Hex
    ['staff-strike', { q: 0, r: 1 }, { q: 0, r: 0 }, { q: 0, r: 0 }, { q: 0, r: -1 }, { q: 1, r: 0 }], // Melee Arc
    ['plague', { q: 0, r: 3 }, { q: 0, r: 0 }, { q: 0, r: 0 }, { q: 0, r: -2 }, { q: 1, r: -1 }], // Burst r1
  ];

  for (const [ability, p1, p2, aim, safe, inside] of cases) {
    const launched = () => endTurn(cast(duel(p1, p2), ability, aim));
    const struck = (g: GameState) => g.mages.p2.hp < g.mages.p2.maxHp || g.mages.p2.statuses.length > 0;

    it(`${ability}: moving out of the Threat Area avoids the hit`, () => {
      expect(struck(endReaction(move(launched(), safe)))).toBe(false);
    });

    it(`${ability}: staying in it, or moving within it, gets hit`, () => {
      expect(struck(endReaction(launched()))).toBe(true);
      const g = launched();
      const within = inside.q === p2.q && inside.r === p2.r ? g : move(g, inside);
      expect(struck(endReaction(within))).toBe(true);
    });
  }
});

describe('resolution', () => {
  it('resolves Attacks in the order they were launched', () => {
    let g = duel({ q: 0, r: 2 }, { q: 0, r: -1 });
    g = cast(g, 'doom', { q: 0, r: -1 });
    g = cast(g, 'firebolt', { q: 0, r: -1 });
    g = endReaction(endTurn(g));
    const hits = g.events.filter((e) => e.kind === 'cast' && /hits|misses/.test(e.text)).map((e) => e.text);
    expect(hits[0]).toMatch(/Doom/);
    expect(hits[1]).toMatch(/Firebolt/);
  });

  it('hits every mage in the Threat Area, the caster included', () => {
    let g = duel({ q: 0, r: 1 }, { q: 0, r: -1 });
    g = cast(g, 'plague', { q: 0, r: 0 }); // P1 stands in its own Burst
    g = endReaction(endTurn(g));
    expect(g.mages.p1.hp).toBeLessThan(g.mages.p1.maxHp);
    expect(g.mages.p2.hp).toBeLessThan(g.mages.p2.maxHp);
  });
});

describe('Attacks with nothing to threaten', () => {
  it('cannot be aimed so that the Threat Area is empty (e.g. a Line straight into adjacent Rock)', () => {
    const g = duel({ q: 0, r: 2 }, { q: 0, r: -2 });
    g.tiles['0,1'].terrain = 'rock';
    expect(actionError(g, { type: 'cast', player: 'p1', abilityId: 'firebolt', target: { q: 0, r: 1 } })).toMatch(/aim/);
    expect(validTargets(g, 'p1', 'firebolt').some((h) => h.q === 0 && h.r === 1)).toBe(false);
  });

  it('a Deflect whose return path is blocked just cancels the Attack', () => {
    const l: Loadout = { ...loadout(['firebolt', 'deflect']) };
    let g = createGame({ seed: 3, radius: 6, turnSeconds: 20, maxTurns: 60, loadouts: { p1: l, p2: l }, names: { p1: 'A', p2: 'B' } });
    for (const t of Object.values(g.tiles)) t.terrain = 'plain';
    g.crystals = [];
    g.mages.p1.pos = { q: 2, r: 0 };
    g.mages.p2.pos = { q: 0, r: 0 };
    g.mages.p1.mana = g.mages.p2.mana = 30;
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'firebolt', target: { q: 0, r: 0 } });
    g = act(g, { type: 'endTurn', player: 'p1' });
    g.tiles['1,0'].terrain = 'rock'; // something now stands between them on the way back
    g = act(g, { type: 'cast', player: 'p2', abilityId: 'deflect', target: g.mages.p2.pos, attackId: g.pending[0].id });
    expect(g.pending.every((a) => a.area.length > 0)).toBe(true);
  });
});
