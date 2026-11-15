import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { actionError, applyAction, castError, createGame } from './engine';
import type { Hex } from './hex';
import type { Action, GameState, Loadout } from './types';

const loadout = (abilities: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 3, magic: 0, movespeed: 0 },
  abilityIds: ['staff-strike', ...abilities],
  passiveIds: [],
});
const KIT = ['firebolt', 'frost-lance', 'doom', 'quick-stab', 'counterspell', 'deflect', 'ward'];

function duel(a: Hex = { q: 0, r: 2 }, b: Hex = { q: 0, r: -1 }): GameState {
  const g = createGame({
    seed: 3,
    radius: 6,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(KIT), p2: loadout(KIT) },
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
const p2pos = (g: GameState) => g.mages.p2.pos;
/** P1 launches the given attacks at P2, then it becomes P2's Reaction Phase. */
function underFire(...abilities: string[]): GameState {
  let g = duel();
  for (const id of abilities) g = act(g, { type: 'cast', player: 'p1', abilityId: id, target: p2pos(g) });
  return act(g, { type: 'endTurn', player: 'p1' });
}
const react = (g: GameState, abilityId: string, attackId?: number) =>
  act(g, { type: 'cast', player: 'p2', abilityId, target: g.mages.p2.pos, attackId });
const resolve = (g: GameState) => act(g, { type: 'endReaction', player: 'p2' });

describe('Reaction Spells', () => {
  it('can only be cast in the Reaction Phase, for Mana but no AP', () => {
    const calm = duel();
    expect(castError(calm, 'p1', 'counterspell')).toMatch(/Reaction Phase/);
    const g = underFire('firebolt');
    const mana = g.mages.p2.mana;
    const after = react(g, 'counterspell', g.pending[0].id);
    expect(after.mages.p2.ap).toBe(2);
    expect(after.mages.p2.mana).toBeLessThan(mana);
  });

  it('Counterspell cancels only the chosen Spell; other Attacks still land', () => {
    let g = underFire('doom', 'firebolt');
    const firebolt = g.pending.find((a) => a.abilityId === 'firebolt')!;
    g = resolve(react(g, 'counterspell', firebolt.id));
    expect(g.mages.p2.statuses.some((s) => s.kind === 'vulnerable')).toBe(true); // Doom landed
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp); // Firebolt didn't
  });

  it('Counterspell cannot stop a Technique', () => {
    const close = duel({ q: 0, r: 0 }, { q: 0, r: -1 });
    const stab = act(close, { type: 'cast', player: 'p1', abilityId: 'quick-stab', target: { q: 0, r: -1 } });
    const r = act(stab, { type: 'endTurn', player: 'p1' });
    expect(castError(r, 'p2', 'counterspell', r.mages.p2.pos, r.pending[0].id)).toMatch(/Technique/);
  });

  it('Ward covers every Attack in this resolution, then fades', () => {
    let g = underFire('firebolt', 'frost-lance'); // 3 + 2 damage
    g = resolve(react(g, 'ward')); // absorbs 4 across both
    expect(g.mages.p2.maxHp - g.mages.p2.hp).toBe(1);
    expect(g.mages.p2.shield).toBe(0);
  });

  it('Deflect sends a Line back at the attacker as a new Attack that cannot itself be countered', () => {
    let g = underFire('firebolt');
    g = resolve(react(g, 'deflect', g.pending[0].id));
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp);
    expect(g.pending).toHaveLength(1);
    expect(g.pending[0].caster).toBe('p2');
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(g.phase).toBe('reaction');
    expect(castError(g, 'p1', 'counterspell', g.mages.p1.pos, g.pending[0].id)).toMatch(/reaction/i);
  });

  it('Ward can also be cast proactively in the Action Phase for 1 AP', () => {
    let g = act(duel(), { type: 'cast', player: 'p1', abilityId: 'ward', target: { q: 0, r: 2 } });
    expect(g.mages.p1.ap).toBe(1);
    expect(g.mages.p1.shield).toBeGreaterThan(0);
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'firebolt', target: p2pos(g) });
    expect(g.mages.p1.shield).toBeGreaterThan(0); // still up for our next resolution
  });
});

describe('AI reactions', () => {
  it('casts a Reaction Spell when it cannot dodge', () => {
    let g = underFire('firebolt');
    g.mages.p2.statuses = [{ kind: 'root', turns: 1, power: 0 }];
    const a = chooseAction(g, 'p2');
    expect(a.type).toBe('cast');
    g = act(g, a);
    expect(g.mages.p2.mana).toBeLessThan(30);
  });
});
