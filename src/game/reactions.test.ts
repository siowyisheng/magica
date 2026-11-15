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
const KIT = ['firebolt', 'frost-lance', 'doom', 'counterspell', 'deflect', 'ward'];

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
  it('can only be cast in the Reaction Phase, for Mana and 1 AP', () => {
    const calm = duel();
    expect(castError(calm, 'p1', 'counterspell')).toMatch(/Reaction Phase/);
    const g = underFire('firebolt');
    const mana = g.mages.p2.mana;
    const after = react(g, 'counterspell', g.pending[0].id);
    expect(after.mages.p2.ap).toBe(1);
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
    const stab = act(close, { type: 'cast', player: 'p1', abilityId: 'staff-strike', target: { q: 0, r: -1 } });
    const r = act(stab, { type: 'endTurn', player: 'p1' });
    expect(castError(r, 'p2', 'counterspell', r.mages.p2.pos, r.pending[0].id)).toMatch(/Technique/);
  });

  it('Ward covers every Attack in this resolution, then fades', () => {
    let g = underFire('firebolt', 'frost-lance'); // 4 + 4 damage
    g = resolve(react(g, 'ward')); // absorbs 4 across both
    expect(g.mages.p2.maxHp - g.mages.p2.hp).toBe(4);
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

  it('Ward works only as a Reaction, not as an action', () => {
    expect(castError(duel(), 'p1', 'ward')).toMatch(/Reaction Phase/);
    expect(actionError(duel(), { type: 'cast', player: 'p1', abilityId: 'ward', target: { q: 0, r: 2 } })).not.toBeNull();
  });

  it('Ward is Fast: it costs Mana but no AP', () => {
    const g = underFire('firebolt');
    const after = react(g, 'ward');
    expect(after.mages.p2.ap).toBe(2);
    expect(after.mages.p2.mana).toBeLessThan(g.mages.p2.mana);
  });

  it('other Reactions cost 1 AP, so two of them leave nothing for the Action Phase', () => {
    let g = underFire('firebolt', 'frost-lance');
    g = react(g, 'counterspell', g.pending[0].id);
    g = react(g, 'counterspell', g.pending[0].id);
    expect(g.mages.p2.ap).toBe(0);
    expect(castError(g, 'p2', 'deflect')).toMatch(/AP/);
  });
});

describe('Reaction Techniques', () => {
  const kit = (...abilities: string[]) => {
    let g = duel();
    g.mages.p2.abilities = ['staff-strike', ...abilities].map((id) => ({ id }));
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'firebolt', target: p2pos(g) });
    return act(g, { type: 'endTurn', player: 'p1' });
  };
  const stepTo = (g: GameState, abilityId: string, to: Hex) => act(g, { type: 'cast', player: 'p2', abilityId, target: to });

  it('cost 1 AP and no Mana, and only work in the Reaction Phase', () => {
    const calm = duel();
    calm.mages.p1.abilities.push({ id: 'sidestep' });
    expect(castError(calm, 'p1', 'sidestep')).toMatch(/Reaction Phase/);
    const g = kit('sidestep');
    const after = stepTo(g, 'sidestep', { q: 1, r: -1 });
    expect(after.mages.p2.ap).toBe(1);
    expect(after.mages.p2.mana).toBe(g.mages.p2.mana);
    expect(after.mages.p2.pos).toEqual({ q: 1, r: -1 });
  });

  it('Sidestep moves 1 hex and Dodge Roll up to 2', () => {
    const g = kit('sidestep', 'dodge-roll');
    expect(castError(g, 'p2', 'sidestep', { q: 2, r: -1 })).toMatch(/range/i);
    expect(castError(g, 'p2', 'sidestep', { q: 1, r: -1 })).toBeNull();
    expect(castError(g, 'p2', 'dodge-roll', { q: 2, r: -1 })).toBeNull();
    expect(castError(g, 'p2', 'dodge-roll', { q: 3, r: -1 })).toMatch(/range/i);
  });

  it('a step dodges an Attack', () => {
    let g = kit('sidestep');
    g = stepTo(g, 'sidestep', { q: 1, r: -1 });
    g = resolve(g);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp);
  });

  it('a step walks round Rock, so it cannot cross it', () => {
    const g = kit('dodge-roll');
    // Wall off every way to the far side of (0,-1)'s neighbour (0,-2) except through rock-free hexes.
    for (const k of ['0,-2', '1,-2', '-1,-1']) g.tiles[k].terrain = 'rock';
    expect(castError(g, 'p2', 'dodge-roll', { q: 0, r: -3 })).not.toBeNull();
    expect(castError(g, 'p2', 'dodge-roll', { q: 1, r: -1 })).toBeNull();
  });

  it('cannot Move in the Reaction Phase', () => {
    const g = kit('sidestep');
    expect(actionError(g, { type: 'move', player: 'p2', to: { q: 1, r: -1 } })).toMatch(/Reaction/);
  });
});

describe('AI reactions', () => {
  it('prefers the Reaction Spell that prevents the most damage over a cheaper, weaker one', () => {
    let g = underFire('firebolt', 'frost-lance'); // 3 + 2 damage, plus statuses
    g.mages.p2.statuses = [{ kind: 'root', turns: 1, power: 0 }];
    const a = chooseAction(g, 'p2');
    // Ward (6 Mana) stops 4 damage; Deflect (6) stops one Line's 3+status; Counterspell (7) one Spell.
    // The biggest single prevention here is Ward's 4 vs Deflect's 3 + burn + 1 bonus = 5.5 → Deflect the Firebolt.
    expect(a).toMatchObject({ type: 'cast', abilityId: 'deflect', attackId: g.pending.find((p) => p.abilityId === 'firebolt')!.id });
  });

  it('casts a Reaction Spell when it cannot dodge', () => {
    let g = underFire('firebolt');
    g.mages.p2.statuses = [{ kind: 'root', turns: 1, power: 0 }];
    const a = chooseAction(g, 'p2');
    expect(a.type).toBe('cast');
    g = act(g, a);
    expect(g.mages.p2.mana).toBeLessThan(30);
  });
});
