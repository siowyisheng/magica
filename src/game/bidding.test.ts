import { describe, expect, it } from 'vitest';
import { ABILITIES } from './content';
import { usesPerTurn, actionError, applyAction, bidCommitment, castError, createGame, reachable } from './engine';
import type { Hex } from './hex';
import type { Action, GameState, Loadout, PlayerId } from './types';

const loadout = (abilities: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: 0, manaRegen: 0, movespeed: 0 },
  weapon: 'staff', abilityIds: ['staff-strike', ...abilities],
  passiveIds: [],
});

/** Open board; P1 at `a` holds Stasis, P2 at `b`. Both start with `mana`. */
function duel(a: Hex = { q: 0, r: 4 }, b: Hex = { q: 0, r: -3 }, mana = 10): GameState {
  const g = createGame({
    seed: 3,
    radius: 7,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(['stasis']), p2: loadout(['stasis']) },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  g.mages.p1.pos = a;
  g.mages.p2.pos = b;
  g.mages.p1.mana = g.mages.p2.mana = mana;
  return g;
}

const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};
const stasis = (g: GameState) => act(g, { type: 'cast', player: 'p1', abilityId: 'stasis', target: g.mages.p2.pos });
const commit = (g: GameState, player: PlayerId, amount: number, salt = `salt-${player}`) =>
  act(g, { type: 'commitBid', player, hash: bidCommitment(g.bidding!.id, player, amount, salt) });
const reveal = (g: GameState, player: PlayerId, amount: number, salt = `salt-${player}`) =>
  act(g, { type: 'revealBid', player, amount, salt });
const close = (g: GameState) => act(g, { type: 'closeBidding', player: g.active });

/** Run a whole bid: both commit, the window closes, both reveal. */
function contest(g: GameState, casterBid: number, targetBid: number): GameState {
  g = commit(commit(g, 'p1', casterBid), 'p2', targetBid); // both in: the reveal starts at once
  return reveal(reveal(g, 'p1', casterBid), 'p2', targetBid);
}
const rooted = (g: GameState) => g.mages.p2.statuses.some((s) => s.kind === 'root');

describe('Stasis', () => {
  it('is a Fast, 2-Mana contested Spell, once per turn like any Fast Ability', () => {
    const def = ABILITIES.stasis;
    expect(def).toMatchObject({ fast: true, mana: 2, targeting: 'enemy', range: 8 });
    expect(usesPerTurn(def)).toBe(1);
    expect(def.effect.type).toBe('contest');
  });

  it('needs the enemy within 8 hexes and in line of sight', () => {
    expect(castError(duel({ q: 0, r: 4 }, { q: 0, r: -4 }), 'p1', 'stasis', { q: 0, r: -4 })).toBeNull(); // 8 away
    expect(castError(duel({ q: 0, r: 5 }, { q: 0, r: -4 }), 'p1', 'stasis', { q: 0, r: -4 })).toMatch(/range/i); // 9 away
    const blocked = duel();
    blocked.tiles['0,0'].terrain = 'rock';
    expect(castError(blocked, 'p1', 'stasis', blocked.mages.p2.pos)).toMatch(/line of sight/i);
    expect(castError(duel(), 'p1', 'stasis', { q: 1, r: -3 })).toMatch(/enemy/i);
  });

  it('costs 2 Mana and no AP, and opens the bidding', () => {
    const g = stasis(duel());
    expect(g.mages.p1.mana).toBe(8);
    expect(g.mages.p1.ap).toBe(2);
    expect(g.bidding).toMatchObject({ abilityId: 'stasis', caster: 'p1', target: 'p2', stage: 'commit' });
  });

  it('can only be cast once per turn, and not on consecutive turns', () => {
    let g = contest(stasis(duel()), 0, 0);
    expect(castError(g, 'p1', 'stasis', g.mages.p2.pos)).toMatch(/once per turn/i);
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(castError(g, 'p1', 'stasis', g.mages.p2.pos)).toMatch(/cooldown/i); // not on consecutive turns
    g = act(g, { type: 'endTurn', player: 'p1' });
    g = act(g, { type: 'endTurn', player: 'p2' });
    expect(castError(g, 'p1', 'stasis', g.mages.p2.pos)).toBeNull();
  });
});

describe('bidding', () => {
  it('pauses everything else until the bids are resolved', () => {
    const g = stasis(duel());
    expect(actionError(g, { type: 'endTurn', player: 'p1' })).toMatch(/bid/i);
    expect(actionError(g, { type: 'move', player: 'p1', to: { q: 0, r: 3 } })).toMatch(/bid/i);
  });

  it('keeps bids secret until the reveal: only commitments are stored', () => {
    const g = commit(commit(stasis(duel()), 'p1', 7), 'p2', 3);
    expect(JSON.stringify(g.bidding)).not.toMatch(/"amount"|:7|:3[,}]/);
    expect(g.mages.p1.mana).toBe(8); // nothing deducted before the reveal
    expect(g.mages.p2.mana).toBe(10);
  });

  it('lands when the caster bids at least as much as the target, and both bids are spent', () => {
    const tie = contest(stasis(duel()), 4, 4);
    expect(rooted(tie)).toBe(true);
    expect(tie.mages.p1.mana).toBe(8 - 4);
    expect(tie.mages.p2.mana).toBe(10 - 4);
    expect(tie.bidding).toBeNull();
    expect(tie.phase).toBe('action');
    expect(tie.active).toBe('p1');
  });

  it('is resisted when the target bids more, and both bids are still spent', () => {
    const g = contest(stasis(duel()), 2, 5);
    expect(rooted(g)).toBe(false);
    expect(g.mages.p1.mana).toBe(6);
    expect(g.mages.p2.mana).toBe(5);
  });

  it('roots: the target cannot Move on their next turn', () => {
    let g = contest(stasis(duel()), 1, 0);
    g = act(g, { type: 'endTurn', player: 'p1' });
    expect(reachable(g, 'p2').size).toBe(0);
  });

  it('reports the outcome and both bids in the event log', () => {
    const g = contest(stasis(duel()), 3, 1);
    const cue = g.events.map((e) => e.cue).find((c) => c?.kind === 'contest');
    expect(cue).toMatchObject({ kind: 'contest', abilityId: 'stasis', success: true, bids: { p1: 3, p2: 1 } });
  });

  it('rejects a reveal that does not match its commitment', () => {
    const g = commit(commit(stasis(duel()), 'p1', 2), 'p2', 2);
    expect(actionError(g, { type: 'revealBid', player: 'p1', amount: 9, salt: 'salt-p1' })).toMatch(/commit/i);
    expect(actionError(g, { type: 'revealBid', player: 'p1', amount: 2, salt: 'wrong' })).toMatch(/commit/i);
  });

  it('counts a player who never committed as bidding 0', () => {
    let g = close(commit(stasis(duel()), 'p1', 0));
    g = reveal(g, 'p1', 0);
    expect(rooted(g)).toBe(true); // 0 ≥ 0
  });

  it('punishes an overbid: it counts as 0 and forfeits all of that mage’s Mana', () => {
    let g = commit(commit(stasis(duel()), 'p1', 2), 'p2', 99);
    g = reveal(reveal(g, 'p1', 2), 'p2', 99);
    expect(rooted(g)).toBe(true);
    expect(g.mages.p2.mana).toBe(0);
  });

  it('treats a mage who will not reveal as bidding 0 once the reveal times out', () => {
    let g = commit(commit(stasis(duel()), 'p1', 1), 'p2', 6);
    g = reveal(g, 'p1', 1);
    g = act(g, { type: 'revealTimeout', player: 'p1' });
    expect(rooted(g)).toBe(true);
    expect(g.mages.p2.mana).toBe(10);
  });

  it('moves straight to the reveal once both duellists have bid, without waiting out the window', () => {
    const one = commit(stasis(duel()), 'p2', 1);
    expect(one.bidding!.stage).toBe('commit');
    const both = commit(one, 'p1', 3);
    expect(both.bidding!.stage).toBe('reveal');
    expect(actionError(both, { type: 'closeBidding', player: 'p1' })).toMatch(/closed/i);
  });

  it('only accepts one commitment per player, and only from the two duellists', () => {
    const g = commit(stasis(duel()), 'p1', 1);
    expect(actionError(g, { type: 'commitBid', player: 'p1', hash: 'x' })).toMatch(/already/i);
    expect(actionError(duel(), { type: 'commitBid', player: 'p1', hash: 'x' })).toMatch(/no bidding/i);
  });
});

describe('AI bidding', () => {
  it('bids a whole number between 0 and the effect’s severity, never more than its Mana', async () => {
    const { aiBid } = await import('./ai');
    const severity = (ABILITIES.stasis.effect as { severity: number }).severity;
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const g = stasis({ ...duel(), rng: seed * 7919 } as GameState);
      const bid = aiBid(g, 'p2');
      expect(Number.isInteger(bid)).toBe(true);
      expect(bid).toBeGreaterThanOrEqual(0);
      expect(bid).toBeLessThanOrEqual(severity);
      seen.add(bid);
      const poor = { ...g, mages: { ...g.mages, p2: { ...g.mages.p2, mana: 2 } } };
      expect(aiBid(poor, 'p2')).toBeLessThanOrEqual(2);
    }
    expect(seen.size).toBeGreaterThan(3); // it varies
  });

  it('plays a whole bid through chooseAction, legally, for both duellists', async () => {
    const { chooseAction } = await import('./ai');
    let g = stasis(duel());
    for (let i = 0; i < 6 && g.bidding; i++) g = act(g, chooseAction(g, g.active));
    expect(g.bidding).toBeNull();
    expect(g.events.some((e) => e.cue?.kind === 'contest')).toBe(true);
  });

  it('casts Stasis to stop the enemy dodging an Attack it just launched', async () => {
    const { chooseAction } = await import('./ai');
    const l = loadout(['icicle', 'stasis']);
    let g = createGame({ seed: 5, radius: 7, turnSeconds: 20, maxTurns: 60, loadouts: { p1: l, p2: l }, names: { p1: 'A', p2: 'B' } });
    for (const t of Object.values(g.tiles)) t.terrain = 'plain';
    g.crystals = [];
    g.mages.p1.pos = { q: 0, r: 2 };
    g.mages.p2.pos = { q: 0, r: -2 };
    g.mages.p1.mana = 20;
    const casts: string[] = [];
    for (let i = 0; i < 20 && g.active === 'p1'; i++) {
      const a = chooseAction(g, g.active);
      if (a.type === 'cast') casts.push(a.abilityId);
      g = act(g, a);
    }
    expect(casts.indexOf('icicle')).toBeGreaterThanOrEqual(0);
    expect(casts.indexOf('stasis')).toBeGreaterThan(casts.indexOf('icicle'));
  });
});

describe('AI vs AI with Stasis', () => {
  it('plays full matches with bidding to a result and replays them identically', { timeout: 30000 }, async () => {
    const { chooseAction } = await import('./ai');
    const { replay } = await import('./engine');
    const l: Loadout = { ...loadout(['icicle', 'firebolt', 'stasis', 'ward']), stats: { hp: 3, maxMana: 1, manaRegen: 2, movespeed: 0 } };
    let contests = 0;
    for (const seed of [1, 2, 3, 4]) {
      const config = { seed, radius: 7, turnSeconds: 20, maxTurns: 60, loadouts: { p1: l, p2: l }, names: { p1: 'A', p2: 'B' } };
      let g = createGame(config);
      const actions: Action[] = [];
      for (let i = 0; i < 5000 && !g.winner; i++) {
        const a = chooseAction(g, g.active);
        expect(actionError(g, a), JSON.stringify(a)).toBeNull();
        actions.push(a);
        g = applyAction(g, a);
      }
      expect(g.winner).not.toBeNull();
      expect(replay(config, actions)).toEqual(g);
      contests += g.events.filter((e) => e.cue?.kind === 'contest').length;
    }
    expect(contests).toBeGreaterThan(0);
  });
});
