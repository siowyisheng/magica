import { describe, expect, it } from 'vitest';
import { actionError, applyAction, createGame } from './engine';
import type { Action, GameState, Loadout, MatchConfig } from './types';

const loadout = (movespeed = 0, abilityIds = ['staff-strike']): Loadout => ({
  id: 'x', name: 'X', circle: 1, weapon: 'staff', abilityIds, passiveIds: [],
  stats: { hp: 0, maxMana: 0, manaRegen: 0, movespeed },
});

function match(freeMovement: boolean | undefined, p1 = loadout(), p2 = loadout()): GameState {
  const config: MatchConfig = {
    seed: 1, radius: 6, turnSeconds: 20, maxTurns: 60,
    loadouts: { p1, p2 }, names: { p1: 'A', p2: 'B' },
    ...(freeMovement === undefined ? {} : { freeMovement }),
  };
  const g = createGame(config);
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  g.mages.p1.pos = { q: 0, r: 5 };
  g.mages.p2.pos = { q: 0, r: -5 };
  return g;
}

const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};

describe('Free Movement', () => {
  it('gives the first mage Movement Points equal to their Movespeed on the very first turn', () => {
    expect(match(true).mages.p1.mp).toBe(3);
  });

  it('lets a mage walk that far without spending AP', () => {
    const g = act(match(true), { type: 'move', player: 'p1', to: { q: 0, r: 2 } });
    expect(g.mages.p1.ap).toBe(2);
    expect(g.mages.p1.mp).toBe(0);
  });

  it('still lets a mage spend AP for more Movement Points on top', () => {
    const g = act(match(true), { type: 'move', player: 'p1', to: { q: 0, r: -1 } }); // 6 hexes
    expect(g.mages.p1.ap).toBe(1);
  });

  it('gives them again at the start of every Action Phase', () => {
    let g = act(match(true, loadout(), loadout(2)), { type: 'endTurn', player: 'p1' });
    expect(g.mages.p2.mp).toBe(5);
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(g.mages.p1.mp).toBe(3);
  });

  it('is off unless the match turns it on (older matches have no setting)', () => {
    expect(match(undefined).mages.p1.mp).toBe(0);
    expect(match(false).mages.p1.mp).toBe(0);
    const g = act(match(false), { type: 'endTurn', player: 'p1' });
    expect(g.mages.p2.mp).toBe(0);
  });

  it('is cut by Slow, and nothing while Rooted', () => {
    let g = act(match(true), { type: 'endTurn', player: 'p1' });
    g.mages.p1.statuses = [{ kind: 'slow', turns: 2, power: 2 }];
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(g.mages.p1.mp).toBe(1);
    g = act(g, { type: 'endTurn', player: 'p1' });
    g.mages.p1.statuses = [{ kind: 'root', turns: 2, power: 0 }];
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(g.mages.p1.mp).toBe(0);
  });

  it('adds to Movement Points left over from a dodge in the Reaction Phase', () => {
    // P2 (Movespeed 5) is attacked, dodges 1 hex with 1 AP (2 points), keeping 1.
    let g = match(true, loadout(0, ['staff-strike', 'icicle']), loadout(2));
    g.mages.p1.mana = 20;
    g.mages.p2.pos = { q: 0, r: -1 }; // within Icicle's reach
    g = act(g, { type: 'cast', player: 'p1', abilityId: 'icicle', target: g.mages.p2.pos });
    g = act(g, { type: 'endTurn', player: 'p1' });
    expect(g.phase).toBe('reaction');
    g = act(g, { type: 'move', player: 'p2', to: { q: 1, r: -1 } });
    g = act(g, { type: 'endReaction', player: 'p2' });
    expect(g.mages.p2.mp).toBe(1 + 5);
  });

  it('counts toward the walk of a charmed mage', () => {
    const walked = (free: boolean) => {
      let g = act(match(free), { type: 'endTurn', player: 'p1' });
      g.mages.p1.statuses = [{ kind: 'charm', turns: 1, power: 0 }];
      g = act(g, { type: 'endTurn', player: 'p2' });
      return 5 - g.mages.p1.pos.r; // walked straight up toward P2
    };
    expect(walked(true)).toBe(walked(false) + 3);
  });
});
