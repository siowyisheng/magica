import { describe, expect, it } from 'vitest';
import { chooseAction } from './ai';
import { DEFAULT_LOADOUTS } from './content';
import { applyAction, castError, createGame, replay } from './engine';
import { distance, key, line, spiral } from './hex';
import { validateLoadout } from './loadout';
import type { Action, MatchConfig } from './types';

const config: MatchConfig = {
  seed: 42,
  radius: 6,
  turnSeconds: 20,
  maxTurns: 60,
  loadouts: { p1: DEFAULT_LOADOUTS[0], p2: DEFAULT_LOADOUTS[1] },
  names: { p1: 'Alice', p2: 'Bob' },
};

describe('hex math', () => {
  it('distance and spiral agree', () => {
    for (const h of spiral({ q: 0, r: 0 }, 3)) expect(distance({ q: 0, r: 0 }, h)).toBeLessThanOrEqual(3);
    expect(spiral({ q: 0, r: 0 }, 2)).toHaveLength(19);
  });
  it('line has distance + 1 hexes', () => {
    expect(line({ q: 0, r: 0 }, { q: 3, r: -1 })).toHaveLength(4);
  });
});

describe('engine', () => {
  it('default loadouts are valid', () => {
    for (const l of DEFAULT_LOADOUTS) expect(validateLoadout(l)).toEqual([]);
  });

  it('board is point-symmetric', () => {
    const g = createGame(config);
    for (const t of Object.values(g.tiles)) expect(g.tiles[key({ q: -t.q + 0, r: -t.r + 0 })].terrain).toBe(t.terrain);
  });

  it('rejects out-of-turn actions without changing state', () => {
    const g = createGame(config);
    expect(applyAction(g, { type: 'endTurn', player: 'p2' })).toBe(g);
  });

  it('cooldowns block recasting', () => {
    let g = createGame(config);
    g.mages.p1.mana = 30;
    g = applyAction(g, { type: 'cast', player: 'p1', abilityId: 'ward', target: g.mages.p1.pos });
    expect(g.mages.p1.shield).toBeGreaterThan(0);
    g = applyAction(g, { type: 'cast', player: 'p1', abilityId: 'meteor', target: g.mages.p1.pos });
    expect(castError(g, 'p1', 'meteor')).toMatch(/cooldown|AP/);
  });

  it('AI vs AI finishes deterministically and replays identically', () => {
    let g = createGame(config);
    const actions: Action[] = [];
    for (let i = 0; i < 5000 && !g.winner; i++) {
      const a = chooseAction(g, g.active);
      actions.push(a);
      const next = applyAction(g, a);
      expect(next).not.toBe(g); // AI never proposes illegal actions
      g = next;
    }
    expect(g.winner).not.toBeNull();
    expect(replay(config, actions)).toEqual(g);
  });
});
