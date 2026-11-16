import { describe, expect, it } from 'vitest';
import { ABILITIES } from './content';
import { actionError, applyAction, bidCap, bidCommitment, castError, createGame } from './engine';
import { threatArea } from './threat';
import { PERMANENT, type Action, type GameState, type Loadout, type PlayerId } from './types';

const loadout = (abilities: string[]): Loadout => ({
  id: 'x',
  name: 'X',
  circle: 1,
  stats: { hp: 0, maxMana: 4, manaRegen: 0, movespeed: 0 },
  weapon: 'unarmed',
  abilityIds: abilities,
  passiveIds: [],
});

/** Open board; P1 at (0,3) holds `abilities`, P2 at (0,0). Both have 30 Mana. */
function duel(abilities: string[]): GameState {
  const g = createGame({
    seed: 3,
    radius: 7,
    turnSeconds: 20,
    maxTurns: 60,
    loadouts: { p1: loadout(abilities), p2: loadout([]) },
    names: { p1: 'A', p2: 'B' },
  });
  for (const t of Object.values(g.tiles)) t.terrain = 'plain';
  g.crystals = [];
  g.mages.p1.pos = { q: 0, r: 3 };
  g.mages.p2.pos = { q: 0, r: 0 };
  g.mages.p1.mana = g.mages.p2.mana = 30;
  return g;
}
const act = (g: GameState, a: Action) => {
  const err = actionError(g, a);
  if (err) throw new Error(`${a.type}: ${err}`);
  return applyAction(g, a);
};
const cast = (g: GameState, abilityId: string, target = g.mages.p2.pos) => act(g, { type: 'cast', player: 'p1', abilityId, target });
const bid = (g: GameState, player: PlayerId, amount: number) =>
  act(g, { type: 'commitBid', player, hash: bidCommitment(g.bidding!.id, player, amount, `s-${player}`) });
const reveal = (g: GameState, player: PlayerId, amount: number) => act(g, { type: 'revealBid', player, amount, salt: `s-${player}` });
const contest = (g: GameState, a: number, b: number) => reveal(reveal(bid(bid(g, 'p1', a), 'p2', b), 'p1', a), 'p2', b);
const endTurn = (g: GameState) => act(g, { type: 'endTurn', player: g.active });
const endReaction = (g: GameState) => act(g, { type: 'endReaction', player: g.active });
/** P1 ends its turn; P2 reacts (nothing) so the attacks land. */
const land = (g: GameState) => endReaction(endTurn(g));

describe('max bid', () => {
  it('every contested Spell has one: Stasis 6, Doom 5', () => {
    expect(bidCap(ABILITIES.stasis)).toBe(6);
    expect(bidCap(ABILITIES.doom)).toBe(5);
  });

  it('a bid over the max counts as 0 and forfeits all of that mage’s Mana, even with Mana to spare', () => {
    let g = contest(cast(duel(['stasis']), 'stasis'), 2, 7);
    expect(g.mages.p2.mana).toBe(0);
    expect(g.mages.p2.statuses.some((s) => s.kind === 'root')).toBe(true); // 2 ≥ 0
    g = contest(cast(duel(['stasis']), 'stasis'), 2, 6); // exactly the max is fine
    expect(g.mages.p2.mana).toBe(24);
  });
});

describe('Doom', () => {
  it('is a secret-bid curse (range 8, no line of sight) that makes every hit +4, permanently', () => {
    expect(ABILITIES.doom).toMatchObject({ kind: 'spell', targeting: 'enemy', range: 8, noLos: true });
    let g = duel(['doom']);
    g.mages.p1.pos = { q: 0, r: 8 }; // 8 away, with rock between
    g.tiles['0,4'].terrain = 'rock';
    expect(castError(g, 'p1', 'doom', g.mages.p2.pos)).toBeNull();
    g = contest(cast(g, 'doom'), 3, 1);
    const curse = g.mages.p2.statuses.find((s) => s.kind === 'vulnerable')!;
    expect(curse).toMatchObject({ power: 4, turns: PERMANENT });
  });

  it('never wears off', () => {
    let g = contest(cast(duel(['doom']), 'doom'), 3, 0);
    for (let i = 0; i < 6; i++) g = endTurn(g);
    expect(g.mages.p2.statuses.some((s) => s.kind === 'vulnerable')).toBe(true);
  });
});

describe('Magic Missile', () => {
  it('costs 2 pts and 7 Mana, reaches 8 without line of sight, and always lands for 6', () => {
    expect(ABILITIES['magic-missile']).toMatchObject({ points: 2, mana: 7 });
    let g = duel(['magic-missile']);
    g.mages.p1.pos = { q: 0, r: 8 };
    g.tiles['0,4'].terrain = 'rock';
    expect(castError(g, 'p1', 'magic-missile', g.mages.p2.pos)).toBeNull();
    g = land(cast(g, 'magic-missile'));
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 6);
  });

  it('cannot be avoided by moving', () => {
    const g0 = duel(['magic-missile']);
    g0.mages.p2.movespeed = 6; // enough to move while reacting
    let g = cast(g0, 'magic-missile');
    g = endTurn(g);
    g = act(g, { type: 'move', player: 'p2', to: { q: 1, r: -1 } });
    expect(g.mages.p2.pos).toEqual({ q: 1, r: -1 });
    g = endReaction(g);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 6);
  });

  it('only targets the enemy mage', () => {
    const g = duel(['magic-missile']);
    expect(castError(g, 'p1', 'magic-missile', { q: 1, r: 1 })).toMatch(/enemy/i);
  });
});

describe('Soul Drain', () => {
  it('hits instantly for 5 and heals 5, with no Reaction Phase, then waits a turn', () => {
    expect(ABILITIES['soul-drain']).toMatchObject({ points: 2, mana: 10, cooldown: 1 });
    const g0 = duel(['soul-drain']);
    g0.mages.p1.pos = { q: 0, r: 4 }; // range 4
    g0.mages.p1.hp = 3;
    const g = cast(g0, 'soul-drain');
    expect(g.pending).toHaveLength(0);
    expect(g.mages.p2.hp).toBe(g.mages.p2.maxHp - 5);
    expect(g.mages.p1.hp).toBe(8);
    expect(castError(g, 'p1', 'soul-drain', g.mages.p2.pos)).toBeTruthy(); // not again this turn
  });
});

describe('Channel Mana', () => {
  it('is a 1-pt Technique: 1 AP, no Mana, gain 2 Mana, once per turn', () => {
    expect(ABILITIES['channel-mana']).toMatchObject({ kind: 'technique', points: 1, mana: 0, cooldown: 1 });
    const g0 = duel(['channel-mana']);
    g0.mages.p1.mana = 5;
    const g = cast(g0, 'channel-mana', g0.mages.p1.pos);
    expect(g.mages.p1.mana).toBe(7);
    expect(g.mages.p1.ap).toBe(1);
    expect(castError(g, 'p1', 'channel-mana', g.mages.p1.pos)).toBeTruthy();
  });

  it('never overfills Max Mana', () => {
    const g0 = duel(['channel-mana']);
    g0.mages.p1.mana = g0.mages.p1.maxMana - 1;
    expect(cast(g0, 'channel-mana', g0.mages.p1.pos).mages.p1.mana).toBe(g0.mages.p1.maxMana);
  });
});

describe("Dragon's Breath", () => {
  it('stops at rock: nothing behind it, nor the rock itself, is in the cone', () => {
    const g = duel([]);
    const from = { q: 0, r: 0 };
    const open = threatArea(g.tiles, from, { kind: 'cone', range: 4 }, { q: 0, r: -2 })!.map((h) => `${h.q},${h.r}`);
    expect(open).toContain('0,-2');
    expect(open).toContain('0,-3');
    g.tiles['0,-1'].terrain = 'rock';
    const blocked = threatArea(g.tiles, from, { kind: 'cone', range: 4 }, { q: 0, r: -2 })!.map((h) => `${h.q},${h.r}`);
    expect(blocked).not.toContain('0,-1');
    expect(blocked).not.toContain('0,-2');
    expect(blocked).not.toContain('0,-3');
  });
});
