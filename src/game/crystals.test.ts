import { describe, expect, it } from 'vitest';
import { spawnFor } from './board';
import { absorbError, applyAction, createGame, maxMana, replay, round } from './engine';
import { distance, equals, key } from './hex';
import type { Action, GameState, Loadout, MatchConfig } from './types';

const loadout: Loadout = {
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: 0, manaRegen: 0, movespeed: 0 },
  weapon: 'unarmed', abilityIds: [],
  passiveIds: [],
};
const config: MatchConfig = {
  seed: 5,
  radius: 6,
  turnSeconds: 20,
  maxTurns: 60,
  loadouts: { p1: loadout, p2: loadout },
  names: { p1: 'A', p2: 'B' },
};

const endTurn = (g: GameState) => applyAction(g, { type: 'endTurn', player: g.active });
const crystal = (g: GameState, size: 'large' | 'small') => g.crystals.find((c) => c.size === size)!;

describe('Mana Crystals at the start', () => {
  it('Large is Spawning at the centre; Small is Ready, equidistant from both spawns', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = createGame({ ...config, seed });
      expect(g.crystals).toHaveLength(2);
      expect(crystal(g, 'large')).toMatchObject({ pos: { q: 0, r: 0 }, state: 'spawning' });
      const small = crystal(g, 'small');
      expect(small.state).toBe('ready');
      expect(distance(small.pos, spawnFor('p1', 6))).toBe(distance(small.pos, spawnFor('p2', 6)));
      expect(g.tiles[key(small.pos)].terrain).toBe('plain');
    }
  });
});

describe('crystal states', () => {
  it('advance one step at the start of each round', () => {
    let g = createGame(config);
    g = endTurn(g); // still round 1
    expect(crystal(g, 'large').state).toBe('spawning');
    g = endTurn(g); // round 2
    expect(round(g)).toBe(2);
    expect(crystal(g, 'large').state).toBe('almostReady');
    g = endTurn(endTurn(g)); // round 3
    expect(crystal(g, 'large').state).toBe('ready');
  });
});

describe('Absorb Mana', () => {
  /** Put P1 on the given crystal on P1's turn in round `r`. */
  function standingOn(size: 'large' | 'small', r: number): GameState {
    let g = createGame(config);
    while (round(g) < r || g.active !== 'p1') g = endTurn(g);
    g.mages.p1.pos = crystal(g, size).pos;
    g.mages.p1.mana = 0;
    return g;
  }

  it('needs a Ready crystal under you and costs 1 AP', () => {
    const g = standingOn('large', 2);
    expect(absorbError(g, 'p1')).toMatch(/Ready/);
    const off = standingOn('small', 1);
    off.mages.p1.pos = { q: 0, r: 5 };
    expect(absorbError(off, 'p1')).toMatch(/crystal/i);
    const ok = applyAction(standingOn('small', 3), { type: 'absorb', player: 'p1' });
    expect(ok.mages.p1.ap).toBe(1);
  });

  it('gives a fixed 4 Mana from a Small crystal and 6 from a Large one, whatever the round', () => {
    for (const r of [3, 4, 9]) {
      expect(applyAction(standingOn('small', r), { type: 'absorb', player: 'p1' }).mages.p1.mana).toBe(4);
      expect(applyAction(standingOn('large', Math.max(r, 3)), { type: 'absorb', player: 'p1' }).mages.p1.mana).toBe(6);
    }
  });

  it('respects the Mana cap', () => {
    const g = standingOn('large', 20);
    g.mages.p1.mana = maxMana(g.mages.p1) - 1;
    expect(applyAction(g, { type: 'absorb', player: 'p1' }).mages.p1.mana).toBe(maxMana(g.mages.p1));
  });

  it('respawns the crystal as Spawning, roughly equidistant and away from both mages', () => {
    for (const seed of [11, 12, 13, 14]) {
      let g = createGame({ ...config, seed });
      while (round(g) < 3 || g.active !== 'p1') g = endTurn(g);
      const before = crystal(g, 'small').pos;
      g.mages.p1.pos = before;
      g = applyAction(g, { type: 'absorb', player: 'p1' });
      const c = crystal(g, 'small');
      expect(c.state).toBe('spawning');
      expect(equals(c.pos, before)).toBe(false);
      const [d1, d2] = [distance(c.pos, g.mages.p1.pos), distance(c.pos, g.mages.p2.pos)];
      expect(Math.abs(d1 - d2)).toBeLessThanOrEqual(1);
      expect(Math.min(d1, d2)).toBeGreaterThanOrEqual(2);
      expect(g.tiles[key(c.pos)].terrain).toBe('plain');
      expect(equals(c.pos, crystal(g, 'large').pos)).toBe(false);
    }
  });

  it('replays identically', () => {
    let g = createGame(config);
    const actions: Action[] = [];
    const act = (a: Action) => {
      actions.push(a);
      g = applyAction(g, a);
    };
    while (round(g) < 3) act({ type: 'endTurn', player: g.active });
    g.mages.p1.pos = crystal(g, 'small').pos; // teleport isn't an action, so replay from the same setup
    const setup = structuredClone(g);
    act({ type: 'absorb', player: 'p1' });
    let r = setup;
    r = applyAction(r, actions[actions.length - 1]);
    expect(r.crystals).toEqual(g.crystals);
    expect(replay(config, actions.slice(0, -1)).crystals).toEqual(setup.crystals);
  });
});
