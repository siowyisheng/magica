import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { actionError, applyAction, createGame, maxMana } from './engine';
import { distance, type Hex } from './hex';
import type { Action, GameState, Loadout } from './types';

const loadout = (abilityIds: string[], movespeed = 0, weapon: Loadout['weapon'] = 'staff'): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 3, maxMana: 2, manaRegen: 0, movespeed },
  weapon,
  abilityIds,
  passiveIds: [],
});

function duel(p1: Loadout, p2: Loadout): GameState {
  const g = createGame({ seed: 9, radius: 6, turnSeconds: 20, maxTurns: 60, loadouts: { p1, p2 }, names: { p1: 'A', p2: 'B' } });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  return g;
}

const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};

/** Let p1's AI act until it ends its turn; returns its actions. */
function p1Turn(g: GameState): Action[] {
  const taken: Action[] = [];
  while (g.active === 'p1' && !g.winner) {
    const a = chooseAction(g, 'p1');
    taken.push(a);
    g = act(g, a);
  }
  return taken;
}

describe('AI attacking a mage who can dodge', () => {
  it('follows an Attack they would step out of with one covering where they would step to', () => {
    const g = duel(loadout(['staff-strike', 'icicle']), loadout(['staff-strike'], 1)); // Movespeed 4: 1 hex per AP while reacting
    g.mages.p1.pos = { q: 0, r: 3 };
    g.mages.p2.pos = { q: 0, r: -3 };
    g.mages.p1.mana = 20;
    // Rock all round the enemy but one hex they could dodge to (Icicle drops over rock).
    const escape: Hex = { q: 1, r: -3 };
    for (const [k, t] of Object.entries(g.tiles)) {
      const [q, r] = k.split(',').map(Number);
      if (distance({ q, r }, g.mages.p2.pos) <= 2 && !(q === 0 && r === -3) && !(q === escape.q && r === escape.r)) t.terrain = 'rock';
    }
    const casts = p1Turn(g).filter((a): a is Extract<Action, { type: 'cast' }> => a.type === 'cast' && a.abilityId === 'icicle');
    expect(casts.map((c) => `${c.target!.q},${c.target!.r}`).sort()).toEqual(['0,-3', '1,-3']);
  });
});

describe('AI positioning for the enemy turn', () => {
  it('with no Attack left this turn, a caster backs out of a melee mage’s reach', () => {
    const g = duel(loadout(['staff-strike', 'firebolt']), loadout(['slash'], 1, 'sword')); // they walk 4 a turn
    g.mages.p1.pos = { q: 0, r: 0 };
    g.mages.p2.pos = { q: 0, r: -3 };
    g.mages.p1.mana = 0; // nothing left to cast
    g.mages.p1.ap = 1;
    const a = chooseAction(g, 'p1');
    expect(a.type).toBe('move');
    // They can walk 4 (keeping an AP for Slash) and then reach 1 more.
    expect(distance((a as { to: Hex }).to, g.mages.p2.pos)).toBeGreaterThan(5);
  });

  it('spends a last AP it cannot use for anything else on topping up Mana', () => {
    const g = duel(loadout(['staff-strike', 'channel-mana']), loadout(['staff-strike']));
    g.mages.p1.pos = { q: 0, r: 3 };
    g.mages.p2.pos = { q: 0, r: -3 };
    g.mages.p1.statuses = [{ kind: 'root', turns: 1, power: 0 }]; // can't walk anywhere
    g.mages.p1.mana = maxMana(g.mages.p1) - 2;
    g.mages.p1.ap = 1;
    expect(chooseAction(g, 'p1')).toMatchObject({ type: 'cast', abilityId: 'channel-mana' });
  });
});
