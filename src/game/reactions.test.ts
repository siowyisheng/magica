import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { actionError, applyAction, castError, createGame, reachable } from './engine';
import type { Hex } from './hex';
import type { Action, GameState, Loadout } from './types';

const loadout = (abilities: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 3, maxMana: 0, manaRegen: 0, movespeed: 0 },
  weapon: 'staff', abilityIds: ['staff-strike', ...abilities],
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
    let g = underFire('frost-lance', 'firebolt');
    const firebolt = g.pending.find((a) => a.abilityId === 'firebolt')!;
    g = resolve(react(g, 'counterspell', firebolt.id));
    expect(g.mages.p2.statuses.some((s) => s.kind === 'slow')).toBe(true); // Frost Lance landed
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 4); // only Frost Lance's 4 damage, not Firebolt's
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
  it('Block is a Reaction Technique: 1 AP, no Mana, only in the Reaction Phase', () => {
    const calm = duel();
    calm.mages.p1.abilities.push({ id: 'block', uses: 0 });
    expect(castError(calm, 'p1', 'block')).toMatch(/Reaction Phase/);
    const g = underFire('firebolt');
    g.mages.p2.abilities.push({ id: 'block', uses: 0 });
    const after = react(g, 'block');
    expect(after.mages.p2.ap).toBe(1);
    expect(after.mages.p2.mana).toBe(g.mages.p2.mana);
  });
});

describe('walking as a Reaction', () => {
  const reacting = (movespeed: number) => {
    const g = underFire('firebolt');
    g.mages.p2.movespeed = movespeed;
    return g;
  };

  it('records the hexes walked, for the board to animate', () => {
    const g = reacting(5); // 2 hexes for 1 AP
    const from = g.mages.p2.pos;
    const after = act(g, { type: 'move', player: 'p2', to: { q: 2, r: -1 } });
    const ev = after.events.find((e) => e.kind === 'move' && e.path)!;
    expect(ev.player).toBe('p2');
    expect(ev.path![0]).toEqual(from);
    expect(ev.path!.at(-1)).toEqual({ q: 2, r: -1 });
    for (const h of ev.path!) expect(after.tiles[`${h.q},${h.r}`].terrain).not.toBe('rock');
  });

  it('goes round Rock, so it cannot cross it', () => {
    const g = reacting(5);
    for (const k of ['0,-2', '1,-2', '-1,-1']) g.tiles[k].terrain = 'rock';
    expect(actionError(g, { type: 'move', player: 'p2', to: { q: 0, r: -3 } })).not.toBeNull();
    expect(actionError(g, { type: 'move', player: 'p2', to: { q: 1, r: -1 } })).toBeNull();
  });

  it('is slowed and rooted like any other walking', () => {
    const g = reacting(5);
    g.mages.p2.statuses = [{ kind: 'slow', turns: 1, power: 1 }];
    expect(Math.max(...[...reachable(g, 'p2').values()])).toBe(2); // 1 per AP, 2 AP
    g.mages.p2.statuses = [{ kind: 'root', turns: 1, power: 0 }];
    expect(reachable(g, 'p2').size).toBe(0);
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
